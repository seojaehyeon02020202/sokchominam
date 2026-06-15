/**
 * VSEPR Molecular Geometry Simulator - 3D Renderer (Three.js)
 * Features: Materialization animation, camera sweeps, specific atom rendering (H, F, O), double bonds.
 */

const VSEPR3D = (() => {
    let scene, camera, renderer, container;
    let centralAtomMesh, lightPoint;
    
    // Pools to keep track of active 3D meshes
    let bondMeshes = [];      // Cylinders representing bonds
    let outerAtomMeshes = [];  // Spheres representing surrounding atoms
    let orbitalMeshes = [];    // Groups representing lone pair lobes
    
    // Settings & State
    let showOrbitalsState = true;
    let cameraAngle = { theta: 0, phi: Math.PI / 2.5 };
    let targetCameraAngle = { theta: Math.PI / 4, phi: Math.PI / 2.5 };
    let cameraRadius = 6.5;
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    
    // Animation targets
    let animationActive = false;
    let meshesData = []; // Array of { mesh, targetPos, currentPos, type: 'atom'|'bond'|'orbital', targetScale, currentScale, doubleBond: bool, offsetDir: Vector3 }
    
    // Color codes
    const CENTRAL_COLORS = {
        'Be': 0x8e8e93,  // Apple Gray
        'B':  0xaf52de,  // Apple Purple
        'C':  0x0071e3,  // Apple Blue
        'N':  0x5856d6,  // Apple Indigo
        'O':  0xff3b30,  // Apple Red
        'P':  0xff9900,  // Apple Orange
        'S':  0xffcc00,  // Apple Yellow
        'Cl': 0x248a3d,  // Apple Dark Green
        'Sandbox': 0x5856d6
    };
    
    const ATOM_SPECS = {
        'H':  { color: 0xf5f5f7, radius: 0.28 }, // Apple light gray, small
        'Be': { color: 0x8e8e93, radius: 0.44 }, // Apple Gray
        'B':  { color: 0xaf52de, radius: 0.42 }, // Apple Purple
        'C':  { color: 0x0071e3, radius: 0.40 }, // Apple Blue
        'N':  { color: 0x5856d6, radius: 0.38 }, // Apple Indigo
        'O':  { color: 0xff3b30, radius: 0.38 }, // Apple Red
        'F':  { color: 0x34c759, radius: 0.40 }, // Apple Green
        'P':  { color: 0xff9900, radius: 0.46 }, // Apple Orange
        'S':  { color: 0xffcc00, radius: 0.45 }, // Apple Yellow
        'Cl': 0x248a3d,  // Apple Dark Green
    };
    
    const BOND_COLOR = 0xe8e8ed; // Apple search filter gray
    const ORBITAL_COLOR = 0x0071e3; // Apple Blue (semi-transparent)
    const ELECTRON_COLOR = 0x2997ff; // Apple Bright Blue link on dark
    
    // Radius of outer atom arrangement
    const R = 1.8;

    /**
     * Map active slot names to specific 3D coordinate vectors based on steric number (SN)
     */
    function calculateSlotVectors(slots, bp, lp) {
        const sn = bp + lp;
        const vectors = {};
        
        // Active slots on the board
        const activeSlots = Object.keys(slots).filter(s => slots[s] !== null);
        
        if (sn === 2) {
            // Linear configuration
            // Active slots should point to opposite sides
            let idx = 0;
            const standardVecs = [new THREE.Vector3(0, 0, R), new THREE.Vector3(0, 0, -R)];
            
            // Map the filled slots
            activeSlots.forEach(slot => {
                vectors[slot] = standardVecs[idx++] || new THREE.Vector3(R, 0, 0);
            });
        } 
        else if (sn === 3) {
            // Trigonal Planar
            // Vector 0: straight up (Top)
            // Vector 1: down-left (Left)
            // Vector 2: down-right (Right)
            const vTop = new THREE.Vector3(0, R, 0);
            const vLeft = new THREE.Vector3(-R * Math.cos(Math.PI/6), -R * Math.sin(Math.PI/6), 0);
            const vRight = new THREE.Vector3(R * Math.cos(Math.PI/6), -R * Math.sin(Math.PI/6), 0);
            const vBottom = new THREE.Vector3(0, -R, 0);

            // Assign mapping based on slots
            if (slots.top && slots.left && slots.right) {
                vectors.top = vTop; vectors.left = vLeft; vectors.right = vRight;
            } else if (slots.bottom && slots.left && slots.right) {
                vectors.bottom = vBottom; vectors.left = vLeft; vectors.right = vRight;
            } else {
                // Fallback sequential mapping
                let idx = 0;
                const standardVecs = [vTop, vLeft, vRight];
                activeSlots.forEach(slot => {
                    vectors[slot] = standardVecs[idx++];
                });
            }
        } 
        else if (sn === 4) {
            // Tetrahedral
            // Vector 0: straight up (Top)
            // Vector 1: down-left (Left)
            // Vector 2: down-right-forward (Right)
            // Vector 3: down-right-backward (Bottom)
            const vTop = new THREE.Vector3(0, R, 0);
            const vLeft = new THREE.Vector3(-R * Math.sqrt(8/9), -R/3, 0);
            const vRight = new THREE.Vector3(R * Math.sqrt(2/9), -R/3, R * Math.sqrt(2/3));
            const vBottom = new THREE.Vector3(R * Math.sqrt(2/9), -R/3, -R * Math.sqrt(2/3));

            vectors.top = vTop;
            vectors.left = vLeft;
            vectors.right = vRight;
            vectors.bottom = vBottom;
        }

        return vectors;
    }

    /**
     * Initializes the 3D canvas
     */
    function init(containerId) {
        container = document.getElementById(containerId);
        if (!container) return;
        
        // 1. Scene setup
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x000000, 0.05);
        
        // 2. Camera setup
        camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
        updateCameraPosition();
        
        // 3. Renderer setup
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        
        // Clear loading overlay
        const loader = document.getElementById('loading');
        if (loader) loader.style.opacity = '0';
        setTimeout(() => { if (loader) loader.remove(); }, 500);
        
        container.appendChild(renderer.domElement);
        
        // 4. Lights Setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambientLight);
        
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(5, 10, 7);
        scene.add(dirLight1);
        
        const dirLight2 = new THREE.DirectionalLight(0x0071e3, 0.35); // Apple Blue fill light
        dirLight2.position.set(-5, -5, -5);
        scene.add(dirLight2);
        
        // Point light in the center for Materialization flash & Octet glow
        lightPoint = new THREE.PointLight(0x0071e3, 0, 8);
        lightPoint.position.set(0, 0, 0);
        scene.add(lightPoint);
        
        // 5. Central Atom
        const centralGeo = new THREE.SphereGeometry(0.65, 32, 32);
        const centralMat = new THREE.MeshStandardMaterial({
            color: CENTRAL_COLORS['C'],
            roughness: 0.18,
            metalness: 0.15,
            emissive: new THREE.Color(0x000000),
            emissiveIntensity: 0
        });
        centralAtomMesh = new THREE.Mesh(centralGeo, centralMat);
        scene.add(centralAtomMesh);
        
        // 6. Setup controls
        window.addEventListener('resize', onWindowResize);
        setupInteraction();
        
        // Start animation loop
        animate();
    }
    
    function setupInteraction() {
        const dom = renderer.domElement;
        
        dom.addEventListener('mousedown', (e) => {
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        dom.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            cameraAngle.theta -= deltaX * 0.007;
            cameraAngle.phi -= deltaY * 0.007;
            
            cameraAngle.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraAngle.phi));
            
            targetCameraAngle.theta = cameraAngle.theta;
            targetCameraAngle.phi = cameraAngle.phi;
            
            updateCameraPosition();
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        window.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        dom.addEventListener('wheel', (e) => {
            e.preventDefault();
            cameraRadius += e.deltaY * 0.005;
            cameraRadius = Math.max(3.5, Math.min(10.0, cameraRadius));
            updateCameraPosition();
        }, { passive: false });
        
        // Touch events
        dom.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        });
        
        dom.addEventListener('touchmove', (e) => {
            if (!isDragging || e.touches.length !== 1) return;
            const deltaX = e.touches[0].clientX - previousMousePosition.x;
            const deltaY = e.touches[0].clientY - previousMousePosition.y;
            
            cameraAngle.theta -= deltaX * 0.008;
            cameraAngle.phi -= deltaY * 0.008;
            cameraAngle.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraAngle.phi));
            
            targetCameraAngle.theta = cameraAngle.theta;
            targetCameraAngle.phi = cameraAngle.phi;
            
            updateCameraPosition();
            previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
        
        dom.addEventListener('touchend', () => {
            isDragging = false;
        });
    }
    
    function updateCameraPosition() {
        camera.position.x = cameraRadius * Math.sin(cameraAngle.phi) * Math.sin(cameraAngle.theta);
        camera.position.y = cameraRadius * Math.cos(cameraAngle.phi);
        camera.position.z = cameraRadius * Math.sin(cameraAngle.phi) * Math.cos(cameraAngle.theta);
        camera.lookAt(0, 0, 0);
    }
    
    function onWindowResize() {
        if (!container || !renderer) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    function createOrbitalLobe() {
        const group = new THREE.Group();
        
        const lobeGeo = new THREE.SphereGeometry(0.55, 32, 16);
        lobeGeo.scale(0.85, 1.6, 0.85);
        lobeGeo.translate(0, 0.85, 0);
        
        const lobeMat = new THREE.MeshStandardMaterial({
            color: 0x2997ff, // Bright Apple Blue
            emissive: 0x0071e3,
            emissiveIntensity: 0.95,
            transparent: true,
            opacity: 0.68,
            roughness: 0.1,
            metalness: 0.1,
            depthWrite: true, // Use true to ensure sorting works correctly on canvas
            side: THREE.DoubleSide
        });
        const lobeMesh = new THREE.Mesh(lobeGeo, lobeMat);
        group.add(lobeMesh);
        
        const elecGeo = new THREE.SphereGeometry(0.12, 16, 16);
        const elecMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // Bright white electron pair dots for contrast
        
        const elec1 = new THREE.Mesh(elecGeo, elecMat);
        elec1.position.set(0.18, 1.25, 0.08);
        group.add(elec1);
        
        const elec2 = new THREE.Mesh(elecGeo, elecMat);
        elec2.position.set(-0.18, 1.25, -0.08);
        group.add(elec2);
        
        return group;
    }

    /**
     * Resets current 3D meshes in the viewport
     */
    function clearMeshes() {
        bondMeshes.forEach(b => scene.remove(b));
        outerAtomMeshes.forEach(a => scene.remove(a));
        orbitalMeshes.forEach(o => scene.remove(o));
        
        bondMeshes = [];
        outerAtomMeshes = [];
        orbitalMeshes = [];
        meshesData = [];
    }

    /**
     * Formats 3D scene representation based on 2D Assembly Board State
     */
    function updateMolecule(bp, lp, centralElement, octetSatisfied, showOrbitals, slots = {}) {
        showOrbitalsState = showOrbitals;
        
        // 1. Update central atom
        const colorKey = CENTRAL_COLORS[centralElement] ? centralElement : 'Sandbox';
        centralAtomMesh.material.color.setHex(CENTRAL_COLORS[colorKey]);
        
        if (octetSatisfied) {
            centralAtomMesh.material.emissive.setHex(0x0071e3);
            centralAtomMesh.material.emissiveIntensity = 0.45;
            lightPoint.color.setHex(0x0071e3);
            lightPoint.intensity = 1.8;
        } else {
            centralAtomMesh.material.emissive.setHex(0x000000);
            centralAtomMesh.material.emissiveIntensity = 0;
            lightPoint.intensity = 0;
        }

        // 2. Clear old representations
        clearMeshes();

        // 3. Get standard vectors for this steric number (SN)
        const sn = bp + lp;
        let standardVecs = [];
        if (sn === 1) {
            standardVecs = [new THREE.Vector3(0, 0, R)];
        } else if (sn === 2) {
            standardVecs = [new THREE.Vector3(0, 0, R), new THREE.Vector3(0, 0, -R)];
        } else if (sn === 3) {
            standardVecs = [
                new THREE.Vector3(0, R, 0),
                new THREE.Vector3(R * Math.cos(Math.PI/6), -R * Math.sin(Math.PI/6), 0),
                new THREE.Vector3(-R * Math.cos(Math.PI/6), -R * Math.sin(Math.PI/6), 0)
            ];
        } else if (sn === 4) {
            standardVecs = [
                new THREE.Vector3(0, R, 0),
                new THREE.Vector3(R * Math.sqrt(8/9), -R/3, 0),
                new THREE.Vector3(-R * Math.sqrt(2/9), -R/3, R * Math.sqrt(2/3)),
                new THREE.Vector3(-R * Math.sqrt(2/9), -R/3, -R * Math.sqrt(2/3))
            ];
        }

        // Separate filled slots (BP)
        const filledSlots = [];
        const slotNames = ['top', 'bottom', 'left', 'right'];
        
        slotNames.forEach(name => {
            if (slots[name]) {
                filledSlots.push({ name: name, element: slots[name] });
            }
        });

        // Assign vectors sequentially
        let vecIdx = 0;

        // Render Bonding Atoms & Cylinders
        filledSlots.forEach(item => {
            if (vecIdx >= standardVecs.length) return;
            const targetPos = standardVecs[vecIdx++];
            const element = item.element;

            const spec = ATOM_SPECS[element] || { color: 0xffffff, radius: 0.35 };

            // Outer atom mesh
            const outerGeo = new THREE.SphereGeometry(spec.radius, 32, 32);
            const outerMat = new THREE.MeshStandardMaterial({
                color: spec.color,
                roughness: 0.2,
                metalness: 0.1
            });
            const outerMesh = new THREE.Mesh(outerGeo, outerMat);
            outerMesh.scale.set(0.01, 0.01, 0.01);
            scene.add(outerMesh);
            outerAtomMeshes.push(outerMesh);

            // Bond mesh setup
            const isDouble = (element === 'O');
            const isTriple = (element === 'N');

            if (isTriple) {
                // Triple bonds: Three parallel cylinders
                const dir = targetPos.clone().normalize();
                let perp = new THREE.Vector3(0, 0, 1);
                if (Math.abs(dir.dot(perp)) > 0.95) {
                    perp.set(0, 1, 0);
                }
                const offsetVec = new THREE.Vector3().crossVectors(dir, perp).normalize().multiplyScalar(0.14);

                for (let i = 0; i < 3; i++) {
                    const cylinderGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 16);
                    cylinderGeo.translate(0, 0.5, 0); // Offset base pivot

                    const cylinderMat = new THREE.MeshStandardMaterial({
                        color: BOND_COLOR,
                        roughness: 0.4,
                        metalness: 0.15
                    });
                    const cylinderMesh = new THREE.Mesh(cylinderGeo, cylinderMat);
                    cylinderMesh.scale.set(1, 0.01, 1);
                    scene.add(cylinderMesh);
                    bondMeshes.push(cylinderMesh);

                    let currentOffset = new THREE.Vector3(0, 0, 0);
                    if (i === 0) currentOffset.copy(offsetVec);
                    else if (i === 2) currentOffset.copy(offsetVec).negate();

                    meshesData.push({
                        mesh: cylinderMesh,
                        type: 'bond',
                        currentPos: new THREE.Vector3(0, 0, 0),
                        targetPos: targetPos.clone(),
                        currentScale: 0.01,
                        targetScale: targetPos.length(),
                        doubleBond: true, // Reuse position offset interpolation logic in animate()
                        offsetDir: currentOffset
                    });
                }
            } else if (isDouble) {
                // Double bonds: Two parallel cylinders
                const dir = targetPos.clone().normalize();
                let perp = new THREE.Vector3(0, 0, 1);
                if (Math.abs(dir.dot(perp)) > 0.95) {
                    perp.set(0, 1, 0);
                }
                const offsetVec = new THREE.Vector3().crossVectors(dir, perp).normalize().multiplyScalar(0.12);

                for (let i = 0; i < 2; i++) {
                    const cylinderGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 16);
                    cylinderGeo.translate(0, 0.5, 0); // Offset base pivot

                    const cylinderMat = new THREE.MeshStandardMaterial({
                        color: BOND_COLOR,
                        roughness: 0.4,
                        metalness: 0.15
                    });
                    const cylinderMesh = new THREE.Mesh(cylinderGeo, cylinderMat);
                    cylinderMesh.scale.set(1, 0.01, 1);
                    scene.add(cylinderMesh);
                    bondMeshes.push(cylinderMesh);

                    meshesData.push({
                        mesh: cylinderMesh,
                        type: 'bond',
                        currentPos: new THREE.Vector3(0, 0, 0),
                        targetPos: targetPos.clone(),
                        currentScale: 0.01,
                        targetScale: targetPos.length(),
                        doubleBond: true,
                        offsetDir: i === 0 ? offsetVec.clone() : offsetVec.clone().negate()
                    });
                }
            } else {
                // Single bond cylinder
                const cylinderGeo = new THREE.CylinderGeometry(0.08, 0.08, 1, 16);
                cylinderGeo.translate(0, 0.5, 0);

                const cylinderMat = new THREE.MeshStandardMaterial({
                    color: BOND_COLOR,
                    roughness: 0.4,
                    metalness: 0.15
                });
                const cylinderMesh = new THREE.Mesh(cylinderGeo, cylinderMat);
                cylinderMesh.scale.set(1, 0.01, 1);
                scene.add(cylinderMesh);
                bondMeshes.push(cylinderMesh);

                meshesData.push({
                    mesh: cylinderMesh,
                    type: 'bond',
                    currentPos: new THREE.Vector3(0, 0, 0),
                    targetPos: targetPos.clone(),
                    currentScale: 0.01,
                    targetScale: targetPos.length(),
                    doubleBond: false
                });
            }

            meshesData.push({
                mesh: outerMesh,
                type: 'atom',
                currentPos: new THREE.Vector3(0, 0, 0),
                targetPos: targetPos.clone(),
                currentScale: 0.01,
                targetScale: 1.0
            });
        });

        // Render Lone Pair Lobe Orbitals (LP)
        if (showOrbitalsState) {
            for (let i = 0; i < lp; i++) {
                if (vecIdx >= standardVecs.length) break;
                const targetPos = standardVecs[vecIdx++];

                const orbitalMesh = createOrbitalLobe();
                orbitalMesh.scale.set(0.01, 0.01, 0.01);
                scene.add(orbitalMesh);
                orbitalMeshes.push(orbitalMesh);

                meshesData.push({
                    mesh: orbitalMesh,
                    type: 'orbital',
                    currentPos: new THREE.Vector3(0, 0, 0),
                    targetPos: targetPos.clone(),
                    currentScale: 0.01,
                    targetScale: 1.0
                });
            }
        }

        animationActive = true;
    }

    /**
     * Triggers Materialization animations: sweeps camera and spawns glowing particles
     */
    function materialize() {
        // 1. Point light flash
        lightPoint.intensity = 8.0;
        
        // 2. Camera sweeping effect: Set camera theta 180 degrees backward and lerp it to target
        cameraAngle.theta = targetCameraAngle.theta - Math.PI;
        cameraAngle.phi = targetCameraAngle.phi + 0.4;
        
        // Reset scale variables in mesh data to force grow animation
        meshesData.forEach(item => {
            item.currentScale = 0.01;
            item.currentPos.set(0, 0, 0);
        });

        animationActive = true;
    }

    /**
     * Animation frame handler
     */
    function animate() {
        requestAnimationFrame(animate);

        // Interpolate camera angle sweep
        if (!isDragging) {
            cameraAngle.theta += (targetCameraAngle.theta - cameraAngle.theta) * 0.06;
            cameraAngle.phi += (targetCameraAngle.phi - cameraAngle.phi) * 0.06;
            updateCameraPosition();
        }

        // Interpolate flash point light intensity decay
        if (lightPoint.intensity > 0) {
            // Decays slowly to 0 or stays at 1.8 if octet satisfies
            const decayTarget = (lightPoint.intensity > 2.0 && centralAtomMesh.material.emissiveIntensity > 0) ? 1.8 : 0;
            lightPoint.intensity += (decayTarget - lightPoint.intensity) * 0.05;
        }

        // Position & Scale Lerp transitions
        if (animationActive) {
            let changesLeft = false;

            meshesData.forEach(item => {
                const scaleSpeed = 0.08;
                item.currentScale += (item.targetScale - item.currentScale) * scaleSpeed;
                
                const posSpeed = 0.08;
                item.currentPos.lerp(item.targetPos, posSpeed);

                if (item.type === 'atom' || item.type === 'orbital') {
                    item.mesh.position.copy(item.currentPos);
                    item.mesh.scale.setScalar(item.currentScale);
                    
                    if (item.type === 'orbital' && item.currentPos.lengthSq() > 0.001) {
                        const dir = item.currentPos.clone().normalize();
                        item.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                    }
                } 
                else if (item.type === 'bond') {
                    // Offset base coordinate if it represents double bond
                    if (item.doubleBond && item.offsetDir) {
                        const scaledOffset = item.offsetDir.clone().multiplyScalar(item.currentScale / item.targetScale);
                        item.mesh.position.copy(scaledOffset);
                    } else {
                        item.mesh.position.set(0, 0, 0);
                    }

                    item.mesh.scale.set(1, item.currentScale, 1);
                    
                    if (item.currentPos.lengthSq() > 0.001) {
                        const dir = item.currentPos.clone().normalize();
                        item.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                    }
                }

                // Check remaining transition threshold
                if (Math.abs(item.targetScale - item.currentScale) > 0.002 || 
                    item.currentPos.distanceTo(item.targetPos) > 0.002) {
                    changesLeft = true;
                }
            });

            if (!changesLeft) {
                animationActive = false;
            }
        }

        // Soft idle wobble when not dragging
        if (!isDragging && centralAtomMesh && !animationActive) {
            centralAtomMesh.rotation.y += 0.0025;
            centralAtomMesh.rotation.x += 0.0008;
            
            outerAtomMeshes.forEach(mesh => {
                mesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0025);
            });
            bondMeshes.forEach(mesh => {
                mesh.quaternion.multiplyQuaternions(
                    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.0025),
                    mesh.quaternion
                );
                // Orbit double bonds around center Y-axis
                if (mesh.position.lengthSq() > 0.001) {
                    mesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0025);
                }
            });
            orbitalMeshes.forEach(mesh => {
                mesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0025);
                if (mesh.position.lengthSq() > 0.001) {
                    const dir = mesh.position.clone().normalize();
                    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                }
            });
            
            targetCameraAngle.theta += 0.0004;
            cameraAngle.theta += 0.0004;
            updateCameraPosition();
        }

        renderer.render(scene, camera);
    }

    return {
        init,
        updateMolecule,
        materialize
    };
})();
