// Simulation of a knee-joint using cannonjs and threejs

// three vars
var camera, scene, renderer, controls, spotLight;

// cannon vars
var world, motor;
var fixedTimeStep = 1.0 / 60.0;
var maxSubSteps = 3;
var lastTime;

// Combined three/cannon vars
var objects = {};

// Control vars
var motor_direction = "back";

// UI
var is_paused = false;

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function togglePlayPause() {
    is_paused = !is_paused;
}

function resetCamera() {
    controls.reset();
}

init();
animate();

function init() {
    initUI();
    initTHREE();
    initCANNON();
    initLeg();
}

function initUI() {
    var pauseButton = document.getElementById("btn-play-pause");
    pauseButton.addEventListener("click", togglePlayPause, false);

    var resetCamButton = document.getElementById("btn-reset-camera");
    resetCamButton.addEventListener("click", resetCamera, false);
}

function initTHREE() {
    var width = window.innerWidth,
        height = window.innerHeight,
        fov = 65,
        near = 0.01,
        far = 500,
        default_camera_position = [-8, 8, 8];

    var canvasContainer = document.getElementById("canvas");

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });

    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xffffff);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.gammaInput = true;
    renderer.gammaOutput = true;

    canvasContainer.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    // Camera and controls
    camera = new THREE.PerspectiveCamera(fov, width / height, near, far);
    camera.position.set(...default_camera_position);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.minDistance = 2;
    controls.maxDistance = 50;
    // controls.update() must be called after any manual changes to the camera"s transform

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff));

    spotLight = new THREE.SpotLight(0xffffff);
    spotLight.position.set(10, 30, 10);
    spotLight.angle = Math.PI / 4;

    spotLight.penumbra = 0.05;
    spotLight.decay = 2;

    spotLight.distance = 50;

    spotLight.castShadow = true;

    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;

    spotLight.shadow.camera.near = 10;
    spotLight.shadow.camera.far = 50;
    spotLight.shadow.camera.fov = 30;

    scene.add(spotLight);

    // renderer.setClearColor( 0x0 );
    // lightHelper = new THREE.SpotLightHelper( spotLight );
    // scene.add( lightHelper );
    // shadowCameraHelper = new THREE.CameraHelper( spotLight.shadow.camera );
    // scene.add( shadowCameraHelper );

    // Create ground plane and ground grid
    var groundMaterial = new THREE.ShadowMaterial();

    // Rotate vertically and push beneath grid to prevent bleeding through
    var groundGeometry = new THREE.PlaneGeometry(far / 5, far / 5);
    groundGeometry.rotateX(-Math.PI / 2);
    groundGeometry.translate(0, -0.05, 0);

    var ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.receiveShadow = true;

    scene.add(ground);

    var grid = new THREE.GridHelper(far / 5, far / 5);
    scene.add(grid);

    var axes = new THREE.AxesHelper(far / 15);
    axes.position.y = 0.05;
    scene.add(axes);

    window.addEventListener("resize", onWindowResize, false);
}

function initCANNON() {
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);

    // Create a plane (mass == 0 makes the body static)
    var groundShape = new CANNON.Plane();
    var groundBody = new CANNON.Body({ mass: 0 });

    // Rotate ground so that it is y-axis up (instead of z)
    groundBody.quaternion.setFromAxisAngle(
        new CANNON.Vec3(1, 0, 0),
        -Math.PI / 2
    );

    groundBody.addShape(groundShape);
    world.addBody(groundBody);
}

function initLeg() {
    // Upper leg (cylinder)
    var ul_name = "upper-leg",
        ul_height = 2,
        ul_radius = 0.4,
        ul_mass = 0; // fix leg in plac,
    (ul_position = [0, ul_height * 2.1, 0]), (ul_color = "green");

    addCylinder(ul_name, ul_radius, ul_height, ul_position, ul_mass, ul_color);

    // Lower leg (cylinder)
    var ll_name = "lower-leg",
        ll_height = 2,
        ll_radius = 0.3,
        ll_mass = 1,
        ll_position = [0, ul_height, 0],
        ll_color = "blue";

    addCylinder(ll_name, ll_radius, ll_height, ll_position, ll_mass, ll_color);

    addJoint(ul_name, ll_name);
}

function addCylinder(name, radius, height, position, mass, color) {
    // Create rendered object
    var geometry = new THREE.CylinderGeometry(radius, radius, height);
    var material = new THREE.MeshStandardMaterial({ color: color });
    var mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    scene.add(mesh);

    // spotLight.target = mesh;
    // controls.target.copy( mesh.position );
    // controls.update();

    // Create the physics object
    var shape = new CANNON.Cylinder(radius, radius, height, 10);

    // Rotate cannon cylinder to match three cylinder
    var q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    var t = new CANNON.Vec3(0, 0, 0);
    shape.transformAllPoints(t, q);

    var body = new CANNON.Body({
        mass: mass,
        position: new CANNON.Vec3(...position)
    });

    body.addShape(shape);

    world.addBody(body);

    objects[name] = {
        mesh: mesh,
        body: body
    };
}

function addJoint(name1, name2) {
    motor = new CANNON.HingeConstraint(
        objects[name1].body,
        objects[name2].body,
        {
            pivotA: new CANNON.Vec3(0, -1, 0),
            axisA: new CANNON.Vec3(1, 0, 0),
            pivotB: new CANNON.Vec3(0, 1, 0)
            // axisB: new CANNON.Vec3(1, 0, 0)
        }
    );

    motor.enableMotor();
    motor.setMotorSpeed(3);
    motor.collideConnected = false;

    world.addConstraint(motor);
}

function animate(time) {
    requestAnimationFrame(animate);

    // required if controls.enableDamping or controls.autoRotate are set to true
    // controls.update();

    // if (this.isFollowing) {
    // camera.lookAt(cubeT.position);
    // }

    if (!is_paused) {
        if (lastTime !== undefined) {
            var dt = (time - lastTime) / 1000;
            world.step(fixedTimeStep, dt, maxSubSteps);
        }
        lastTime = time;
    } else {
        lastTime = undefined;
    }

    // Update rendered transform of all objects
    for (var obj of Object.values(objects)) {
        obj.mesh.position.copy(obj.body.position);
        obj.mesh.quaternion.copy(obj.body.quaternion);
    }

    // Angle between the two bodies of the motor
    x = objects["upper-leg"].body.quaternion;
    y = objects["lower-leg"].body.quaternion;
    z = x * y.conjugate();
    angle = 2 * Math.acos(x.mult(y.inverse()).w);

    // Update motor control
    // if (angle < Math.PI/1.5) {
    //     motor.setMotorSpeed(3);
    // } else {
    //     motor.setMotorSpeed(0);
    // }

    if (motor_direction === "back" && angle > Math.PI / 1.5) {
        motor.setMotorSpeed(-3);
        motor_direction = "forward";
    } else if (motor_direction === "forward" && angle < 0.1) {
        motor.setMotorSpeed(3);
        motor_direction = "back";
    }

    renderer.render(scene, camera);
}
