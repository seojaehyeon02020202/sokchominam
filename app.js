/**
 * VSEPR Molecular Geometry Simulator - Application Logic & Drag-and-Drop Controller
 */

// Atom Database (Unified configuration for both Central and Outer properties)
const ATOM_PROPERTIES = {
    'H':  { name: '수소',     valence: 1, maxElectrons: 2, stableElectrons: 2, contribution: 1 },
    'Be': { name: '베릴륨',   valence: 2, maxElectrons: 4, stableElectrons: 4, contribution: 2 },
    'B':  { name: '붕소',     valence: 3, maxElectrons: 6, stableElectrons: 6, contribution: 3 },
    'C':  { name: '탄소',     valence: 4, maxElectrons: 8, stableElectrons: 8, contribution: 4 },
    'N':  { name: '질소',     valence: 5, maxElectrons: 8, stableElectrons: 8, contribution: 3 },
    'O':  { name: '산소',     valence: 6, maxElectrons: 8, stableElectrons: 8, contribution: 2 },
    'F':  { name: '플루오린', valence: 7, maxElectrons: 8, stableElectrons: 8, contribution: 1 },
    'P':  { name: '인',       valence: 5, maxElectrons: 8, stableElectrons: 8, contribution: 3 },
    'S':  { name: '황',       valence: 6, maxElectrons: 8, stableElectrons: 8, contribution: 2 },
    'Cl': { name: '염소',     valence: 7, maxElectrons: 8, stableElectrons: 8, contribution: 1 }
};

// Application State
const state = {
    appState: 'assembly', // 'assembly' | 'explore'
    board: {
        central: 'C', // Preloaded with Carbon
        slots: {
            top: null,
            bottom: null,
            left: null,
            right: null
        }
    },
    showOrbitals: true,
    activeDiagramTab: 'lewis',
    draggedElement: null,
    draggedType: null,
    quizQuestions: []
};

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    // 1. Init Three.js Renderer
    VSEPR3D.init('canvas-container');
    
    // 2. Setup Events
    setupPaletteDragEvents();
    setupBoardDropEvents();
    setupUIActions();
    setupQuizEvents();
    
    // 3. Trigger initial draw
    renderBoard();
    updateDimmingState();
    updateBlueprintHUD();
});

/**
 * Attaches dragstart and dragend listeners to elements in the palette
 */
function setupPaletteDragEvents() {
    const paletteItems = document.querySelectorAll('.palette-item');
    paletteItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            if (item.classList.contains('dimmed')) {
                e.preventDefault();
                return;
            }
            const element = item.getAttribute('data-element');
            const type = item.getAttribute('data-type');
            
            state.draggedElement = element;
            state.draggedType = type;
            
            e.dataTransfer.setData('text/plain', element);
            item.style.opacity = '0.4';
        });
        
        item.addEventListener('dragend', (e) => {
            item.style.opacity = '1';
            state.draggedElement = null;
            state.draggedType = null;
            
            // Clear hover highlights on slots
            const slots = document.querySelectorAll('.board-slot');
            slots.forEach(s => s.classList.remove('drag-over'));
        });

        // Click-to-place fallback (For touch devices or quick click)
        item.addEventListener('click', () => {
            if (item.classList.contains('dimmed')) return;
            const element = item.getAttribute('data-element');
            
            if (!state.board.central) {
                setCentralAtom(element);
            } else {
                // Find first empty cardinal slot
                const slots = ['top', 'bottom', 'left', 'right'];
                const emptySlot = slots.find(s => state.board.slots[s] === null);
                if (emptySlot) {
                    setCardinalSlot(emptySlot, element);
                }
            }
        });
    });
}

/**
 * Attaches dragover, dragleave, and drop listeners to slots on the board
 */
function setupBoardDropEvents() {
    const slots = document.querySelectorAll('.board-slot');
    
    slots.forEach(slot => {
        const slotType = slot.getAttribute('data-slot'); // 'central' | 'top' | 'bottom' | 'left' | 'right'
        
        slot.addEventListener('dragover', (e) => {
            e.preventDefault(); // Required to allow drop
            
            // Allow dropping central slot anytime, and cardinal slots if central exists
            if (slotType === 'central') {
                slot.classList.add('drag-over');
            } else if (slotType !== 'central' && state.board.central !== null) {
                const paletteItem = document.getElementById(`palette-atom-${state.draggedElement}`);
                if (paletteItem && !paletteItem.classList.contains('dimmed') && state.board.slots[slotType] === null) {
                    slot.classList.add('drag-over');
                }
            }
        });
        
        slot.addEventListener('dragleave', () => {
            slot.classList.remove('drag-over');
        });
        
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            slot.classList.remove('drag-over');
            
            const element = e.dataTransfer.getData('text/plain');
            if (!element) return;
            
            if (slotType === 'central') {
                setCentralAtom(element);
            } else if (slotType !== 'central' && state.board.central !== null) {
                setCardinalSlot(slotType, element);
            }
        });
    });
}

function setupUIActions() {
    // Complete assembly transition
    document.getElementById('btn-complete').addEventListener('click', () => {
        const calc = getVSEPRCalculations();
        if (calc.octet !== 'satisfied') {
            const modal = document.getElementById('octet-warning-modal');
            const desc = document.getElementById('octet-warning-desc');
            desc.innerHTML = `현재 중심 원자 주변의 전자는 <b>${calc.electrons}개</b>입니다.<br>(옥텟 규칙 만족을 위해 8전자 배치가 필요합니다.)`;
            modal.classList.add('active');
        } else {
            switchState('explore');
        }
    });

    // Warning modal buttons
    document.getElementById('btn-modal-continue').addEventListener('click', () => {
        document.getElementById('octet-warning-modal').classList.remove('active');
    });

    document.getElementById('btn-modal-ignore').addEventListener('click', () => {
        document.getElementById('octet-warning-modal').classList.remove('active');
        switchState('explore');
    });
    
    // Rebuild back transition
    document.getElementById('btn-rebuild').addEventListener('click', () => {
        switchState('assembly');
    });

    // Clear board transition
    const btnClearBoard = document.getElementById('btn-clear-board');
    if (btnClearBoard) {
        btnClearBoard.addEventListener('click', () => {
            clearBoard();
        });
    }
    
    // Diagram tab toggle
    document.getElementById('diagram-tab-lewis').addEventListener('click', () => switchDiagramTab('lewis'));
    document.getElementById('diagram-tab-wedge').addEventListener('click', () => switchDiagramTab('wedge'));
    
    // View orbital toggle
    document.getElementById('toggle-orbitals').addEventListener('click', (e) => {
        state.showOrbitals = !state.showOrbitals;
        e.currentTarget.classList.toggle('active', state.showOrbitals);
        trigger3DUpdate();
    });

    // Mode Switcher Tabs
    document.getElementById('tab-build').addEventListener('click', () => {
        // Switch back to build or explore
        const filledOuterCount = Object.values(state.board.slots).filter(v => v !== null).length;
        if (state.board.central && filledOuterCount >= 2) {
            switchState('explore');
        } else {
            switchState('assembly');
        }
    });

    document.getElementById('tab-quiz').addEventListener('click', () => {
        switchState('quiz');
    });
}

/**
 * State Transition Machine (Assembly <-> Explore)
 */
function switchState(targetState) {
    state.appState = targetState;
    
    const panelAssembly = document.getElementById('panel-assembly');
    const panelExplore = document.getElementById('panel-explore');
    const panelQuiz = document.getElementById('panel-quiz');
    const blueprintOverlay = document.getElementById('blueprint-overlay');
    const exploreHUD = document.getElementById('explore-hud');
    const tabBuild = document.getElementById('tab-build');
    const tabQuiz = document.getElementById('tab-quiz');
    
    // Reset all panel active states
    panelAssembly.classList.remove('active');
    panelExplore.classList.remove('active');
    panelQuiz.classList.remove('active');
    
    if (targetState === 'assembly') {
        panelAssembly.classList.add('active');
        blueprintOverlay.classList.add('active');
        exploreHUD.classList.remove('active');
        tabBuild.classList.add('active');
        tabQuiz.classList.remove('active');
        
        // Return 3D canvas to scanning/blurred blueprint layout
        blueprintOverlay.querySelector('.blueprint-scanline').style.animationPlayState = 'running';
        trigger3DUpdate();
    } else if (targetState === 'explore') {
        panelExplore.classList.add('active');
        blueprintOverlay.classList.remove('active');
        exploreHUD.classList.add('active');
        tabBuild.classList.add('active');
        tabQuiz.classList.remove('active');
        
        // Stop scanline animation to conserve performance
        blueprintOverlay.querySelector('.blueprint-scanline').style.animationPlayState = 'paused';
        
        // Generate chemical analysis data
        calculateMoleculeData();
        
        // Trigger materialization camera sweeps
        VSEPR3D.materialize();
    } else if (targetState === 'quiz') {
        panelQuiz.classList.add('active');
        blueprintOverlay.classList.remove('active');
        exploreHUD.classList.remove('active');
        tabBuild.classList.remove('active');
        tabQuiz.classList.add('active');
        
        // Initialize/Render quiz
        initQuizSession();
        renderQuiz();
    }
}

function switchDiagramTab(tab) {
    state.activeDiagramTab = tab;
    document.getElementById('diagram-tab-lewis').classList.toggle('active', tab === 'lewis');
    document.getElementById('diagram-tab-wedge').classList.toggle('active', tab === 'wedge');
    
    document.getElementById('box-lewis').classList.toggle('active', tab === 'lewis');
    document.getElementById('box-wedge').classList.toggle('active', tab === 'wedge');
}

function setCentralAtom(element) {
    state.board.central = element;
    
    // Wipe cardinal slots on central element change to avoid valence conflicts
    state.board.slots = { top: null, bottom: null, left: null, right: null };
    
    renderBoard();
    updateDimmingState();
    updateBlueprintHUD();
    trigger3DUpdate();
}

function setCardinalSlot(slotName, element) {
    state.board.slots[slotName] = element;
    
    renderBoard();
    updateDimmingState();
    updateBlueprintHUD();
    trigger3DUpdate();
}

function clearCardinalSlot(slotName) {
    state.board.slots[slotName] = null;
    
    renderBoard();
    updateDimmingState();
    updateBlueprintHUD();
    trigger3DUpdate();
}

function clearBoard() {
    state.board.central = null;
    state.board.slots = { top: null, bottom: null, left: null, right: null };
    
    renderBoard();
    updateDimmingState();
    updateBlueprintHUD();
    trigger3DUpdate();
}

/**
 * Re-renders the 2D Assembly Board slots in HTML
 */
function renderBoard() {
    // 1. Render Central Slot
    const centralSlot = document.getElementById('slot-central');
    centralSlot.className = 'board-slot slot-central'; // Reset classes
    centralSlot.innerHTML = '';
    
    if (state.board.central) {
        centralSlot.classList.add('filled', `atom-${state.board.central}`);
        
        const symbolSpan = document.createElement('span');
        symbolSpan.className = 'slot-atom-symbol';
        symbolSpan.textContent = state.board.central;
        centralSlot.appendChild(symbolSpan);
    } else {
        centralSlot.innerHTML = `<span class="slot-placeholder">중심<br>원소</span>`;
    }
    
    // 2. Render Outer slots
    const slotNames = ['top', 'bottom', 'left', 'right'];
    slotNames.forEach(slotName => {
        const slotDiv = document.getElementById(`slot-${slotName}`);
        slotDiv.className = `board-slot slot-cardinal slot-${slotName}`;
        slotDiv.innerHTML = '';
        
        const element = state.board.slots[slotName];
        if (element) {
            slotDiv.classList.add('filled', `atom-${element === 'O' ? 'O-outer' : element}`);
            
            // Symbol text
            const symbolSpan = document.createElement('span');
            symbolSpan.className = 'slot-atom-symbol';
            symbolSpan.textContent = element;
            slotDiv.appendChild(symbolSpan);
            
            // Delete button
            const delBtn = document.createElement('button');
            delBtn.className = 'slot-delete-btn';
            delBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Avoid slot trigger
                clearCardinalSlot(slotName);
            });
            slotDiv.appendChild(delBtn);
        } else {
            slotDiv.innerHTML = `<span class="slot-placeholder">+</span>`;
        }
    });

    // 3. Update "Complete Assembly" button disabled state
    const btnComplete = document.getElementById('btn-complete');
    const filledOuterCount = slotNames.filter(name => state.board.slots[name] !== null).length;
    
    // Enable if central atom is set and at least 1 bond is built (to support H2, F2, etc.)
    btnComplete.disabled = !(state.board.central && filledOuterCount >= 1);
}

/**
 * Real-time valence capacity checker that dims out forbidden elements in the palette
 */
function updateDimmingState() {
    const central = state.board.central;
    
    // If no central atom, all outer elements are active (can place central)
    if (!central) {
        document.querySelectorAll('#palette-atoms .palette-item').forEach(item => {
            item.classList.remove('dimmed');
            item.setAttribute('draggable', 'true');
        });
        return;
    }
    
    const spec = ATOM_PROPERTIES[central];
    const maxE = spec.maxElectrons;
    
    // 1. Calculate current outer shell electron sum around central atom
    let currentE = spec.valence;
    
    Object.values(state.board.slots).forEach(element => {
        if (element && ATOM_PROPERTIES[element]) {
            currentE += ATOM_PROPERTIES[element].contribution;
        }
    });
    
    // Check if slots are fully filled
    const slotsFilled = Object.values(state.board.slots).every(v => v !== null);
    
    // 2. Iterate surrounding atoms in palette and check limits
    Object.keys(ATOM_PROPERTIES).forEach(element => {
        const id = `palette-atom-${element}`;
        const item = document.getElementById(id);
        if (!item) return;
        
        const contrib = ATOM_PROPERTIES[element].contribution;
        
        // Dim if adding it exceeds central capacity OR if slots are full
        const isExceeded = (currentE + contrib > maxE) || slotsFilled;
        
        item.classList.toggle('dimmed', isExceeded);
        item.setAttribute('draggable', isExceeded ? 'false' : 'true');
    });
}

/**
 * Updates status text inside the holographic Scanning Overlay
 */
function updateBlueprintHUD() {
    const statusText = document.getElementById('blueprint-status');
    const central = state.board.central;
    
    if (!central) {
        statusText.textContent = "좌측 조립판에 중심 원소를 배치해 주세요.";
        return;
    }
    
    const spec = ATOM_PROPERTIES[central];
    const currentSlots = Object.values(state.board.slots).filter(v => v !== null).length;
    
    if (currentSlots < 1) {
        statusText.innerHTML = `중심 원소 <span style="color:var(--color-accent); font-weight:700;">${central}</span> (${spec.name}) 배치 완료. 주변 슬롯에 원자들을 조립하여 <b>최소 1개 이상의 결합</b>을 만드세요.`;
    } else {
        statusText.innerHTML = `구조 설계 완료! <span style="color:#10b981; font-weight:700;">[분자 만들기 완료]</span> 버튼을 눌러 입체 물질화를 시작하세요.`;
    }
}

/**
 * Triggers rendering update to Three.js canvas
 */
function trigger3DUpdate() {
    const central = state.board.central;
    if (!central) {
        // Hide standard central mesh by scaling to 0
        VSEPR3D.updateMolecule(0, 0, 'Sandbox', false, false, {});
        return;
    }
    
    // Calculate VSEPR parameters based on board state
    const data = getVSEPRCalculations();
    
    // We update 3D mesh coordinates
    const satisfiesOctet = data.octet === 'satisfied';
    VSEPR3D.updateMolecule(data.bp, data.lp, data.central, satisfiesOctet, state.showOrbitals, state.board.slots);
}

/**
 * Computes math parameters from current assembled board configuration
 */
function getVSEPRCalculations() {
    const central = state.board.central;
    const spec = ATOM_PROPERTIES[central];
    
    // Count filled slots (each slot represents 1 bonding region)
    const slotValues = Object.values(state.board.slots).filter(v => v !== null);
    const bp = slotValues.length;
    
    // Calculate shared valence electrons
    let bUsed = 0;
    slotValues.forEach(elem => {
        bUsed += ATOM_PROPERTIES[elem].contribution;
    });
    
    // Calculate remaining lone pair electrons on central atom
    const eLeft = spec.valence - bUsed;
    const lp = Math.max(0, Math.floor(eLeft / 2));
    
    // Total valence shell electrons around central atom
    const electrons = spec.valence + bUsed;
    
    // Check octet satisfied
    let octet = 'deficient';
    if (electrons === spec.stableElectrons) {
        octet = 'satisfied';
    }
    
    return {
        central: central,
        bp: bp,
        lp: lp,
        electrons: electrons,
        octet: octet
    };
}

/**
 * Translates the customized board configuration into chemical geometries and properties
 */
function calculateMoleculeData() {
    const calc = getVSEPRCalculations();
    const bp = calc.bp;
    const lp = calc.lp;
    const sn = bp + lp;
    
    // 1. Generate Chemical Formula Dynamically using a robust algorithm
    const generateChemicalFormula = (central, slots) => {
        const counts = {};
        let totalOuter = 0;
        Object.values(slots).forEach(elem => {
            if (elem) {
                counts[elem] = (counts[elem] || 0) + 1;
                totalOuter++;
            }
        });

        if (totalOuter === 0) {
            return central;
        }

        const sub = n => n <= 1 ? '' : (n === 2 ? '₂' : (n === 3 ? '₃' : '₄'));

        // Homonuclear diatomic molecules (e.g. H2, F2, O2, N2, Cl2)
        if (totalOuter === 1 && Object.keys(counts)[0] === central) {
            return central + '₂';
        }

        // Special textbook exceptions
        if (central === 'O') {
            if (counts['H'] === 2 && !counts['F'] && !counts['Cl']) return 'H₂O';
            if (counts['H'] === 1 && counts['F'] === 1) return 'HOF';
        }
        if (central === 'S') {
            if (counts['H'] === 2) return 'H₂S';
        }
        if (central === 'Cl') {
            if (counts['H'] === 1) return 'HCl';
        }
        if (central === 'F') {
            if (counts['H'] === 1) return 'HF';
        }

        // General rule: Central first, then surrounding atoms.
        // H always comes first among outer elements (like in NH3, PH3, CH4 etc.)
        let formula = central;
        const outerKeys = Object.keys(counts).sort((a, b) => {
            if (a === 'H') return -1;
            if (b === 'H') return 1;
            return a.localeCompare(b);
        });

        outerKeys.forEach(k => {
            formula += k + sub(counts[k]);
        });

        return formula;
    };

    const formula = generateChemicalFormula(calc.central, state.board.slots);

    // Database of actual real-world molecules for matching (Mapped by chemical formula)
    const moleculeDatabase = {
        'H₂': { name: '수소', angle: '180°', polarity: '무극성' },
        'F₂': { name: '플루오린', angle: '180°', polarity: '무극성' },
        'O₂': { name: '산소', angle: '180°', polarity: '무극성' },
        'N₂': { name: '질소', angle: '180°', polarity: '무극성' },
        'Cl₂': { name: '염소 기체', angle: '180°', polarity: '무극성' },
        'HF': { name: '플루오린화 수소', angle: '180°', polarity: '극성' },
        'FH': { name: '플루오린화 수소', angle: '180°', polarity: '극성' },
        'HCl': { name: '염화 수소', angle: '180°', polarity: '극성' },
        'ClH': { name: '염화 수소', angle: '180°', polarity: '극성' },
        'ClF': { name: '일플루오린화 염소 (Chlorine monofluoride)', angle: '180°', polarity: '극성' },
        'FCl': { name: '일플루오린화 염소 (Chlorine monofluoride)', angle: '180°', polarity: '극성' },
        'H₂O': { name: '물 (Water)', angle: '104.5°', polarity: '극성' },
        'H₂S': { name: '황화 수소', angle: '92.1°', polarity: '극성' },
        'OF₂': { name: '이플루오린화 산소', angle: '103°', polarity: '극성' },
        'SF₂': { name: '이플루오린화 황', angle: '98°', polarity: '극성' },
        'SCl₂': { name: '이염화 황', angle: '103°', polarity: '극성' },
        'HOF': { name: '하이포플루오르산', angle: '97°', polarity: '극성' },
        'NH₃': { name: '암모니아', angle: '107°', polarity: '극성' },
        'PH₃': { name: '포스핀 (삼수소화 인)', angle: '93.5°', polarity: '극성' },
        'NF₃': { name: '삼플루오린화 질소', angle: '102.5°', polarity: '극성' },
        'PF₃': { name: '삼플루오린화 인', angle: '97.8°', polarity: '극성' },
        'PCl₃': { name: '삼염화 인', angle: '100°', polarity: '극성' },
        'NH₂F': { name: '플루오로아민', angle: '102.9°', polarity: '극성' },
        'NHF₂': { name: '디플루오로아민', angle: '101°', polarity: '극성' },
        'HNO': { name: '나이트록실 (Nitroxyl)', angle: '109°', polarity: '극성' },
        'FNO': { name: '니트로실 플루오라이드', angle: '110°', polarity: '극성' },
        'CH₄': { name: '메테인', angle: '109.5°', polarity: '무극성' },
        'CF₄': { name: '사플루오린화 탄소', angle: '109.5°', polarity: '무극성' },
        'CCl₄': { name: '사염화 탄소', angle: '109.5°', polarity: '무극성' },
        'CH₃F': { name: '플루오로메테인', angle: '110.0°', polarity: '극성' },
        'CH₃Cl': { name: '클로로메테인 (일염화 메테인)', angle: '108°', polarity: '극성' },
        'CH₂F₂': { name: '디플루오로메테인', angle: '108.3°', polarity: '극성' },
        'CH₂Cl₂': { name: '디클로로메테인 (이염화 메테인)', angle: '113°', polarity: '극성' },
        'CHF₃': { name: '트리플루오로메테인', angle: '108.8°', polarity: '극성' },
        'CHCl₃': { name: '클로로포름 (삼염화 메테인)', angle: '109°', polarity: '극성' },
        'CO₂': { name: '이산화 탄소', angle: '180°', polarity: '무극성' },
        'CS₂': { name: '이황화 탄소', angle: '180°', polarity: '무극성' },
        'CH₂O': { name: '폼알데하이드', angle: '116.5°', polarity: '극성' },
        'CF₂O': { name: '카보닐 플루오라이드', angle: '108.0°', polarity: '극성' },
        'CHFO': { name: '폼일 플루오라이드', angle: '110.0°', polarity: '극성' },
        'BH₃': { name: '수소화 붕소 (보레인)', angle: '120°', polarity: '무극성' },
        'BF₃': { name: '삼플루오린화 붕소', angle: '120°', polarity: '무극성' },
        'BCl₃': { name: '삼염화 붕소', angle: '120°', polarity: '무극성' },
        'BH₂F': { name: '모노플루오로보레인', angle: '120°', polarity: '극성' },
        'BHF₂': { name: '디플루오로보레인', angle: '120°', polarity: '극성' },
        'BeH₂': { name: '수소화 베릴륨', angle: '180°', polarity: '무극성' },
        'BeF₂': { name: '플루오린화 베릴륨', angle: '180°', polarity: '무극성' },
        'BeCl₂': { name: '염화 베릴륨', angle: '180°', polarity: '무극성' },
        'BeHF': { name: '플루오린화 수소화 베릴륨', angle: '180°', polarity: '극성' },
        'CO': { name: '일산화 탄소', angle: '180°', polarity: '극성' },
        'OC': { name: '일산화 탄소', angle: '180°', polarity: '극성' },
        'CS': { name: '일황화 탄소', angle: '180°', polarity: '극성' },
        'SC': { name: '일황화 탄소', angle: '180°', polarity: '극성' },
        'HCN': { name: '사이안화 수소 (Hydrogen cyanide)', angle: '180°', polarity: '극성' },
        'CHN': { name: '사이안화 수소 (Hydrogen cyanide)', angle: '180°', polarity: '극성' },
        'NO': { name: '일산화 질소', angle: '180°', polarity: '극성' },
        'ON': { name: '일산화 질소', angle: '180°', polarity: '극성' }
    };

    // 2. Identify representative chemical name and properties from database
    let name = '존재하지 않는 분자입니다';
    let angle = '가변적';
    let polarity = '가변적';
    let isReal = false;
    
    if (moleculeDatabase[formula]) {
        const entry = moleculeDatabase[formula];
        name = entry.name;
        angle = entry.angle;
        polarity = entry.polarity;
        isReal = true;
    }

    // 3. Identify representative chemical properties
    let mg = '가상의 분자';
    let eg = '가상의 분자';
    
    // Determine bond orders
    const outerAtomsList = Object.values(state.board.slots).filter(v => v !== null);
    const isDouble = outerAtomsList.some(elem => ATOM_PROPERTIES[elem].contribution === 2);
    const isTriple = outerAtomsList.some(elem => ATOM_PROPERTIES[elem].contribution === 3);
    
    // Map shapes
    if (bp === 1) {
        eg = '선형';
        mg = '선형';
        if (!isReal) {
            angle = '180°';
            const outerAtom = outerAtomsList[0];
            polarity = (calc.central === outerAtom) ? '무극성' : '극성';
        }
    }
    else if (sn === 2) {
        eg = '선형';
        mg = '선형';
        if (!isReal) {
            angle = '180°';
            // Polar check: if surrounding elements are different, it is polar
            const activeElems = Object.values(state.board.slots).filter(v => v !== null);
            if (activeElems.length === 2 && activeElems[0] !== activeElems[1]) {
                polarity = '극성';
            } else {
                polarity = '무극성';
            }
        }
    } 
    else if (sn === 3) {
        eg = '평면 삼각형';
        if (lp === 0) {
            mg = '평면 삼각형';
            if (!isReal) {
                angle = '120°';
                const activeElems = Object.values(state.board.slots).filter(v => v !== null);
                const allSame = activeElems.every(v => v === activeElems[0]);
                polarity = allSame ? '무극성' : '극성';
            }
        } else if (lp === 1) {
            mg = '굽은형';
            if (!isReal) {
                angle = '< 120°';
                polarity = '극성';
            }
        }
    } 
    else if (sn === 4) {
        eg = '정사면체';
        if (lp === 0) {
            mg = '사면체형';
            if (!isReal) {
                angle = '109.5°';
                const activeElems = Object.values(state.board.slots).filter(v => v !== null);
                const allSame = activeElems.every(v => v === activeElems[0]);
                polarity = allSame ? '무극성' : '극성';
            }
        } else if (lp === 1) {
            mg = '삼각뿔형';
            if (!isReal) {
                angle = '107°';
                polarity = '극성';
            }
        } else if (lp === 2) {
            mg = '굽은형';
            if (!isReal) {
                angle = '104.5°';
                polarity = '극성';
            }
        }
    }

    // Compile package
    const data = {
        central: calc.central,
        outer: outerAtomsList[0] || 'X', // Representative outer element
        bp: bp,
        lp: lp,
        name: name,
        formula: formula,
        eg: eg,
        mg: mg,
        angle: angle,
        polarity: polarity,
        octet: calc.octet,
        electrons: calc.electrons,
        isDouble: isDouble,
        isTriple: isTriple
    };

    // 4. Update Dashboard Card Texts
    document.querySelector('#card-formula .card-body').innerHTML = data.formula;
    document.querySelector('#card-name .card-body').innerText = data.name;
    document.querySelector('#card-eg .card-body').innerText = data.eg;
    
    const cardMG = document.querySelector('#card-mg .card-body');
    cardMG.innerText = data.mg;
    cardMG.classList.toggle('font-highlight', data.octet === 'satisfied');
    
    document.querySelector('#card-angle .card-body').innerText = data.angle;
    
    const polarityBadge = document.querySelector('#card-polarity .card-body');
    polarityBadge.innerText = data.polarity;
    polarityBadge.className = `card-body polarity-badge ${data.polarity === '극성' ? 'badge-polar' : 'badge-nonpolar'}`;
    
    // 4. Update Octet Indicator
    const octetIndicator = document.getElementById('octet-indicator');
    const statusText = octetIndicator.querySelector('.status-text');
    octetIndicator.className = 'status-indicator';
    
    if (data.octet === 'satisfied') {
        octetIndicator.classList.add('satisfied');
        statusText.innerHTML = `옥텟 만족 <span style="font-family: Orbitron; font-weight:700; color:#10b981;">(8e⁻)</span>`;
    } else {
        octetIndicator.classList.add('warning');
        if (data.central === 'Be') {
            statusText.innerHTML = `옥텟 예외(안정) <span style="font-family: Orbitron; font-weight:700; color:#ff7e5f;">(4e⁻)</span>`;
        } else if (data.central === 'B') {
            statusText.innerHTML = `옥텟 예외(안정) <span style="font-family: Orbitron; font-weight:700; color:#ff7e5f;">(6e⁻)</span>`;
        } else {
            statusText.innerHTML = `옥텟 미달 <span style="font-family: Orbitron; font-weight:700; color:#ff7e5f;">(${data.electrons}e⁻)</span>`;
        }
    }

    // 5. Draw 2D SVG Diagrams
    drawLewisSVG(data);
    drawWedgeSVG(data);
    
    // 6. Update 3D Molecular Model (final sync)
    const satisfiesOctet = data.octet === 'satisfied';
    VSEPR3D.updateMolecule(bp, lp, data.central, satisfiesOctet, state.showOrbitals, state.board.slots);
}

/**
 * Draws the 2D Lewis structure into SVG
 */
function drawLewisSVG(data) {
    const svg = document.getElementById('svg-lewis');
    svg.innerHTML = '';
    
    const satisfiesOctet = data.octet === 'satisfied';
    let containerClass = 'unsatisfied-dim';
    if (satisfiesOctet) containerClass = 'satisfied';
    else if (data.central === 'Be' || data.central === 'B') containerClass = 'warning-amber';
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', containerClass);
    svg.appendChild(g);
    
    // Central label
    const centralText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    centralText.setAttribute('x', '100');
    centralText.setAttribute('y', '100');
    centralText.setAttribute('class', 'lewis-label');
    centralText.textContent = data.central;
    g.appendChild(centralText);
    
    // Render slot mapping: Top, Bottom, Left, Right
    const slots = [
        { name: 'top', x: 100, y: 72 },
        { name: 'bottom', x: 100, y: 128 },
        { name: 'left', x: 72, y: 100 },
        { name: 'right', x: 128, y: 100 }
    ];
    
    const OUTER_POSITIONS = {
        'top': { x: 100, y: 40 },
        'bottom': { x: 100, y: 160 },
        'left': { x: 40, y: 100 },
        'right': { x: 160, y: 100 }
    };
    
    // Determine which slot is filled vs empty
    // Lone pairs are placed automatically on empty slots (up to LP count)
    let filledSlots = [];
    let emptySlots = [];
    
    slots.forEach(s => {
        if (state.board.slots[s.name]) {
            filledSlots.push(s.name);
        } else {
            emptySlots.push(s.name);
        }
    });
    
    const OUTER_LONE_PAIRS = {
        'H': 0, 'Be': 0, 'B': 0, 'C': 0, 'N': 1, 'O': 2, 'F': 3, 'P': 1, 'S': 2, 'Cl': 3
    };

    // Draw Filled Slots as Bonds
    filledSlots.forEach(slotName => {
        const outerElement = state.board.slots[slotName];
        const slot = slots.find(s => s.name === slotName);
        const pos = OUTER_POSITIONS[slotName];
        
        const bondOrder = ATOM_PROPERTIES[outerElement].contribution;
        
        if (bondOrder === 3 && (slotName === 'left' || slotName === 'right')) {
            // Triple bond
            const offset = 5;
            const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const line3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            
            const startX = slotName === 'left' ? 88 : 112;
            const endX = slotName === 'left' ? 52 : 148;
            
            line1.setAttribute('x1', startX); line1.setAttribute('y1', 100 - offset);
            line1.setAttribute('x2', endX); line1.setAttribute('y2', 100 - offset);
            
            line2.setAttribute('x1', startX); line2.setAttribute('y1', 100);
            line2.setAttribute('x2', endX); line2.setAttribute('y2', 100);
            
            line3.setAttribute('x1', startX); line3.setAttribute('y1', 100 + offset);
            line3.setAttribute('x2', endX); line3.setAttribute('y2', 100 + offset);
            
            line1.setAttribute('class', 'lewis-bond');
            line2.setAttribute('class', 'lewis-bond');
            line3.setAttribute('class', 'lewis-bond');
            g.appendChild(line1);
            g.appendChild(line2);
            g.appendChild(line3);
        } else if (bondOrder === 2 && (slotName === 'left' || slotName === 'right')) {
            // Double bond
            const offset = 4;
            const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            
            const startX = slotName === 'left' ? 88 : 112;
            const endX = slotName === 'left' ? 52 : 148;
            
            line1.setAttribute('x1', startX); line1.setAttribute('y1', 100 - offset);
            line1.setAttribute('x2', endX); line1.setAttribute('y2', 100 - offset);
            
            line2.setAttribute('x1', startX); line2.setAttribute('y1', 100 + offset);
            line2.setAttribute('x2', endX); line2.setAttribute('y2', 100 + offset);
            
            line1.setAttribute('class', 'lewis-bond');
            line2.setAttribute('class', 'lewis-bond');
            g.appendChild(line1);
            g.appendChild(line2);
        } else {
            // Single bond
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            let startX = 100, startY = 100;
            let endX = slot.x, endY = slot.y;
            
            if (slotName === 'top') { startY = 88; endY = 52; }
            else if (slotName === 'bottom') { startY = 112; endY = 148; }
            else if (slotName === 'left') { startX = 88; endX = 52; }
            else if (slotName === 'right') { startX = 112; endX = 148; }
            
            line.setAttribute('x1', startX); line.setAttribute('y1', startY);
            line.setAttribute('x2', endX); line.setAttribute('y2', endY);
            line.setAttribute('class', 'lewis-bond');
            g.appendChild(line);
        }
        
        // Outer atom label
        const outerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        outerText.setAttribute('x', pos.x);
        outerText.setAttribute('y', pos.y);
        outerText.setAttribute('class', 'lewis-label');
        outerText.textContent = outerElement;
        g.appendChild(outerText);
        
        // Draw outer lone pairs
        const lpCount = OUTER_LONE_PAIRS[outerElement] || 0;
        if (lpCount > 0) {
            const ox = pos.x, oy = pos.y;
            const dots = [];
            
            if (slotName === 'top') {
                if (lpCount >= 1) dots.push({x: ox-4, y: oy-12}, {x: ox+4, y: oy-12});
                if (lpCount >= 2) dots.push({x: ox-10, y: oy}, {x: ox-10, y: oy-4});
                if (lpCount >= 3) dots.push({x: ox+10, y: oy}, {x: ox+10, y: oy-4});
            } else if (slotName === 'bottom') {
                if (lpCount >= 1) dots.push({x: ox-4, y: oy+12}, {x: ox+4, y: oy+12});
                if (lpCount >= 2) dots.push({x: ox-10, y: oy}, {x: ox-10, y: oy+4});
                if (lpCount >= 3) dots.push({x: ox+10, y: oy}, {x: ox+10, y: oy+4});
            } else if (slotName === 'left') {
                if (lpCount >= 1) dots.push({x: ox-12, y: oy-4}, {x: ox-12, y: oy+4});
                if (lpCount >= 2) dots.push({x: ox-4, y: oy-10}, {x: ox+4, y: oy-10});
                if (lpCount >= 3) dots.push({x: ox-4, y: oy+10}, {x: ox+4, y: oy+10});
            } else if (slotName === 'right') {
                if (lpCount >= 1) dots.push({x: ox+12, y: oy-4}, {x: ox+12, y: oy+4});
                if (lpCount >= 2) dots.push({x: ox-4, y: oy-10}, {x: ox+4, y: oy-10});
                if (lpCount >= 3) dots.push({x: ox-4, y: oy+10}, {x: ox+4, y: oy+10});
            }
            
            dots.forEach(d => {
                const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                dot.setAttribute('cx', d.x); dot.setAttribute('cy', d.y);
                dot.setAttribute('r', '1.8'); dot.setAttribute('class', 'lewis-dot');
                g.appendChild(dot);
            });
        }
    });
    
    // Draw Lone Pairs on empty slots
    let lpToDraw = data.lp;
    for (let i = 0; i < Math.min(lpToDraw, emptySlots.length); i++) {
        const slotName = emptySlots[i];
        const slot = slots.find(s => s.name === slotName);
        const dots = [];
        const sx = slot.x, sy = slot.y;
        const offset = 4;
        
        if (slotName === 'top' || slotName === 'bottom') {
            dots.push({ x: sx - offset, y: sy });
            dots.push({ x: sx + offset, y: sy });
        } else {
            dots.push({ x: sx, y: sy - offset });
            dots.push({ x: sx, y: sy + offset });
        }
        
        dots.forEach(d => {
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', d.x); dot.setAttribute('cy', d.y);
            dot.setAttribute('r', '2.3'); dot.setAttribute('class', 'lewis-dot');
            g.appendChild(dot);
        });
    }
}

/**
 * Draws the Wedge-Dash textbook representation
 */
function drawWedgeSVG(data) {
    const svg = document.getElementById('svg-wedge');
    svg.innerHTML = '';
    
    const satisfiesOctet = data.octet === 'satisfied';
    let containerClass = 'unsatisfied-dim';
    if (satisfiesOctet) containerClass = 'satisfied';
    else if (data.central === 'Be' || data.central === 'B') containerClass = 'warning-amber';
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', containerClass);
    svg.appendChild(g);
    
    // Helpers
    const createWedge = (x1, y1, x2, y2, width = 8) => {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const perpAngle = angle + Math.PI / 2;
        const hx = width * Math.cos(perpAngle) / 2;
        const hy = width * Math.sin(perpAngle) / 2;
        const points = `${x1},${y1} ${x2 + hx},${y2 + hy} ${x2 - hx},${y2 - hy}`;
        
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', points);
        poly.setAttribute('fill', satisfiesOctet ? '#0071e3' : '#8e8e93');
        poly.setAttribute('class', 'lewis-bond');
        return poly;
    };
    
    const createDash = (x1, y1, x2, y2, dashes = 6) => {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        for (let i = 1; i <= dashes; i++) {
            const t = i / dashes;
            const px = x1 + (x2 - x1) * t;
            const py = y1 + (y2 - y1) * t;
            const width = i * 1.5;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const perpAngle = angle + Math.PI / 2;
            const hx = width * Math.cos(perpAngle) / 2;
            const hy = width * Math.sin(perpAngle) / 2;
            
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', px - hx); line.setAttribute('y1', py - hy);
            line.setAttribute('x2', px + hx); line.setAttribute('y2', py + hy);
            line.setAttribute('class', 'lewis-bond');
            group.appendChild(line);
        }
        return group;
    };

    const createOrbitalCloud = (cx, cy, rx, ry, rotate = 0) => {
        const resultGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${cx} ${cy} 
                   C ${cx - rx*2} ${cy - ry*1.5}, ${cx - rx*1.5} ${cy - ry*3}, ${cx} ${cy - ry*3} 
                   C ${cx + rx*1.5} ${cy - ry*3}, ${cx + rx*2} ${cy - ry*1.5}, ${cx} ${cy}`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'rgba(0, 113, 227, 0.12)');
        path.setAttribute('stroke', '#0071e3');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-dasharray', '3,3');
        if (rotate) path.setAttribute('transform', `rotate(${rotate}, ${cx}, ${cy})`);
        resultGroup.appendChild(path);
        
        const d1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        d1.setAttribute('cx', cx - 4); d1.setAttribute('cy', cy - ry*2); d1.setAttribute('r', '1.5'); d1.setAttribute('fill', '#2997ff');
        const d2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        d2.setAttribute('cx', cx + 4); d2.setAttribute('cy', cy - ry*2); d2.setAttribute('r', '1.5'); d2.setAttribute('fill', '#2997ff');
        
        const dotGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        dotGroup.appendChild(d1); dotGroup.appendChild(d2);
        if (rotate) dotGroup.setAttribute('transform', `rotate(${rotate}, ${cx}, ${cy})`);
        resultGroup.appendChild(dotGroup);
        
        return resultGroup;
    };

    // Rendering geometries
    const geometryType = data.mg;
    const centralSymbol = data.central;
    
    // Find active outer elements on slots
    const activeSlots = Object.keys(state.board.slots).filter(s => state.board.slots[s] !== null);
    const outer1 = state.board.slots[activeSlots[0]] || 'X';
    const outer2 = state.board.slots[activeSlots[1]] || 'X';
    const outer3 = state.board.slots[activeSlots[2]] || 'X';
    const outer4 = state.board.slots[activeSlots[3]] || 'X';

    const drawCentralAtom = (x, y) => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x); text.setAttribute('y', y);
        text.setAttribute('class', 'lewis-label');
        text.textContent = centralSymbol;
        g.appendChild(text);
    };

    const drawOuterAtom = (x, y, symbol) => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x); text.setAttribute('y', y);
        text.setAttribute('class', 'lewis-label');
        text.setAttribute('font-size', '16');
        text.textContent = symbol;
        g.appendChild(text);
    };

    const drawLine = (x1, y1, x2, y2) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('class', 'lewis-bond');
        g.appendChild(line);
    };

    if (geometryType === '선형' && data.bp === 1) {
        drawCentralAtom(80, 100);
        if (data.isTriple) {
            drawLine(95, 94, 125, 94);
            drawLine(95, 100, 125, 100);
            drawLine(95, 106, 125, 106);
        } else if (data.isDouble) {
            drawLine(95, 96, 125, 96);
            drawLine(95, 104, 125, 104);
        } else {
            drawLine(95, 100, 125, 100);
        }
        drawOuterAtom(140, 100, outer1);
    } 
    else if (geometryType === '선형') {
        drawCentralAtom(100, 100);
        if (data.isDouble) {
            drawLine(52, 96, 88, 96); drawLine(52, 104, 88, 104);
            drawLine(112, 96, 148, 96); drawLine(112, 104, 148, 104);
        } else {
            drawLine(55, 100, 88, 100); drawLine(112, 100, 145, 100);
        }
        drawOuterAtom(40, 100, outer1);
        drawOuterAtom(160, 100, outer2);
    }  
    else if (geometryType === '평면 삼각형') {
        drawCentralAtom(100, 108);
        drawLine(100, 95, 100, 58);
        drawLine(112, 115, 143, 133);
        drawLine(88, 115, 57, 133);
        
        drawOuterAtom(100, 46, outer1);
        drawOuterAtom(153, 140, outer2);
        drawOuterAtom(47, 140, outer3);
    } 
    else if (geometryType === '굽은형' && data.bp === 2 && data.lp === 1) {
        drawCentralAtom(100, 95);
        drawLine(112, 102, 140, 120);
        drawLine(88, 102, 60, 120);
        
        drawOuterAtom(150, 126, outer1);
        drawOuterAtom(50, 126, outer2);
        g.appendChild(createOrbitalCloud(100, 80, 8, 12, 0));
    } 
    else if (geometryType === '굽은형' && data.bp === 2 && data.lp === 2) {
        drawCentralAtom(100, 100);
        drawLine(112, 108, 138, 128);
        drawLine(88, 108, 62, 128);
        
        drawOuterAtom(148, 136, outer1);
        drawOuterAtom(52, 136, outer2);
        g.appendChild(createOrbitalCloud(100, 85, 7, 10, -40));
        g.appendChild(createOrbitalCloud(100, 85, 7, 10, 40));
    } 
    else if (geometryType === '사면체형') {
        drawCentralAtom(100, 100);
        drawLine(100, 85, 100, 50); // top
        drawOuterAtom(100, 40, outer1);
        
        drawLine(88, 106, 62, 122); // bottom left
        drawOuterAtom(52, 128, outer2);
        
        g.appendChild(createWedge(108, 106, 132, 122, 6)); // wedge bottom right
        drawOuterAtom(142, 128, outer3);
        
        g.appendChild(createDash(112, 100, 142, 100, 5)); // dash right
        drawOuterAtom(152, 100, outer4);
    } 
    else if (geometryType === '삼각뿔형') {
        drawCentralAtom(100, 90);
        drawLine(88, 98, 60, 114);
        drawOuterAtom(50, 122, outer1);
        
        g.appendChild(createWedge(100, 102, 100, 132, 6));
        drawOuterAtom(100, 144, outer2);
        
        g.appendChild(createDash(110, 98, 138, 114, 5));
        drawOuterAtom(148, 122, outer3);
        
        g.appendChild(createOrbitalCloud(100, 75, 8, 12, 0));
    }
}

// ==========================================
// 🧪 Chemistry Mini-Quiz System
// ==========================================
const QUIZ_QUESTIONS = [
    {
        question: "다음 중 옥텟 규칙(8전자 배치)을 만족하지 않는(미완성 또는 예외) 분자는 무엇일까요?",
        options: [
            "CH₄ (메테인)",
            "H₂O (물)",
            "BF₃ (삼플루오린화 붕소)",
            "NH₃ (암모니아)"
        ],
        answer: 2,
        explanation: "붕소(B)는 원자가 전자가 3개이며, 플루오린(F) 3개와 각각 공유 결합을 형성한 후에도 중심 원자 주변에 공유 전자쌍 3쌍(총 전자는 6개)만 가지므로 옥텟 규칙(8전자)을 만족하지 않는 대표적인 예외 분자입니다."
    },
    {
        question: "물(H₂O) 분자의 산소(O) 중심 원자 주변에 존재하는 비공유 전자쌍의 개수와 실제 3D 분자 기하구조의 조합으로 올바른 것은?",
        options: [
            "비공유 전자쌍 1개 - 삼각뿔형",
            "비공유 전자쌍 2개 - 굽은형",
            "비공유 전자쌍 2개 - 선형",
            "비공유 전자쌍 0개 - 평면 삼각형"
        ],
        answer: 1,
        explanation: "산소(O)는 원자가 전자가 6개이며, 수소 2개와 각각 단일 결합을 이루고 남은 전자가 비공유 전자쌍 2쌍으로 존재합니다. 따라서 중심 원자 주변의 총 전자쌍 영역 수는 4개(정사면체 배열)이나, 비공유 전자쌍 2쌍을 제외한 실제 원자 배치는 '굽은형'이 됩니다."
    },
    {
        question: "다음 중 모든 공유 결합이 대칭 구조를 이루어 쌍극자 모멘트의 합이 0이 되는 '무극성 분자'는 무엇일까요?",
        options: [
            "CO₂ (이산화 탄소)",
            "H₂O (물)",
            "NH₃ (암모니아)",
            "OF₂ (이플루오린화 산소)"
        ],
        answer: 0,
        explanation: "이산화 탄소(CO₂)는 탄소와 산소 사이의 극성 결합을 가지지만, 분자 구조가 대칭적인 선형(180°) 구조를 이루어 결합의 극성(쌍극자 모멘트)이 서로 완벽히 상쇄되므로 대표적인 무극성 분자입니다. 반면 물과 암모니아 등은 비대칭 구조로 극성을 띱니다."
    },
    {
        question: "메테인(CH₄)의 중심 탄소(C) 원자 주변에 존재하는 '비공유 전자쌍'의 총개수는 몇 개일까요?",
        options: [
            "0개",
            "1개",
            "2개",
            "4개"
        ],
        answer: 0,
        explanation: "탄소(C)는 원자가 전자가 4개이고 4개의 수소 원자와 각각 공유 결합을 형성하여 4쌍의 공유 전자쌍을 만듭니다. 남은 전자가 없으므로 탄소 원자 주변에 존재하는 비공유 전자쌍은 0개입니다."
    },
    {
        question: "다음 중 중심 원소와 주변 원소 사이에 이중 결합(공유 전자쌍 2쌍)이 존재하는 분자는 무엇일까요?",
        options: [
            "CO₂ (이산화 탄소)",
            "NH₃ (암모니아)",
            "BF₃ (삼플루오린화 붕소)",
            "BeH₂ (수소화 베릴륨)"
        ],
        answer: 0,
        explanation: "이산화 탄소(CO₂)는 탄소 중심 원자가 양쪽의 산소 원자들과 각각 2쌍씩 전자를 공유하여 2개의 이중 결합(O=C=O)을 이룹니다. 암모니아, 삼플루오린화 붕소, 수소화 베릴륨은 모두 단일 결합만으로 결합되어 있습니다."
    },
    {
        question: "다음 중 이황화 탄소(CS₂) 분자의 3D 기하구조와 결합각의 조합으로 올바른 것은?",
        options: [
            "선형 - 180°",
            "굽은형 - 104.5°",
            "평면 삼각형 - 120°",
            "사면체형 - 109.5°"
        ],
        answer: 0,
        explanation: "이황화 탄소(CS₂)는 이산화 탄소(CO₂)와 동일하게 중심 탄소 원자가 양쪽의 황 원자들과 이중 결합을 형성하여 직선 형태인 선형(180°) 구조를 이룹니다."
    },
    {
        question: "포스핀(PH₃) 분자의 중심 인(P) 원자에 대한 설명으로 올바르지 않은 것은?",
        options: [
            "원자가 전자는 5개이다.",
            "공유 전자쌍 3쌍과 비공유 전자쌍 1쌍을 가진다.",
            "분자의 실제 기하구조는 평면 삼각형이다.",
            "수소 원자들과 단일 공유 결합을 형성한다."
        ],
        answer: 2,
        explanation: "포스핀(PH₃)은 비공유 전자쌍 1쌍의 반발력으로 인해 평면 삼각형이 아닌 입체 구조인 삼각뿔형 구조(실제 결합각 약 93.5°)를 가집니다."
    },
    {
        question: "황화 수소(H₂S) 분자가 극성을 띠는 주된 이유는 무엇일까요?",
        options: [
            "황과 수소의 전기음성도가 완벽히 같아서",
            "선형 구조를 이루어 쌍극자 모멘트가 상쇄되기 때문에",
            "비대칭적인 굽은형 구조를 이루어 쌍극자 모멘트가 상쇄되지 않기 때문에",
            "단일 결합이 아닌 이중 결합을 형성하기 때문에"
        ],
        answer: 2,
        explanation: "황화 수소(H₂S)는 물(H₂O)과 마찬가지로 중심 원자에 존재하는 2쌍의 비공유 전자쌍으로 인해 비대칭적인 굽은형 구조를 이룹니다. 따라서 결합의 극성이 상쇄되지 않아 극성 분자가 됩니다."
    }
];

let currentQuizIndex = 0;
let quizScore = 0;
let quizAnswered = false;

function initQuizSession() {
    // Shuffle the full pool of questions
    const shuffled = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5);
    // Choose 5 random questions for this session
    state.quizQuestions = shuffled.slice(0, 5);
    currentQuizIndex = 0;
    quizScore = 0;
    quizAnswered = false;
}

function renderQuiz() {
    const progressBar = document.getElementById('quiz-progress-bar');
    const progressText = document.getElementById('quiz-progress-text');
    const questionEl = document.getElementById('quiz-question');
    const optionsEl = document.getElementById('quiz-options');
    const feedbackBox = document.getElementById('quiz-feedback-box');
    const resultsPanel = document.getElementById('quiz-results');
    const mainCard = document.getElementById('quiz-main-card');

    // Reset feedback
    feedbackBox.classList.add('hidden');
    feedbackBox.className = 'quiz-feedback-box hidden';

    const totalQuestions = state.quizQuestions.length || 5;

    // Check completion
    if (currentQuizIndex >= totalQuestions) {
        mainCard.classList.add('hidden');
        resultsPanel.classList.remove('hidden');
        
        document.getElementById('results-score-num').innerText = quizScore;
        const msgEl = document.getElementById('results-message');
        const descEl = document.getElementById('results-desc');

        if (quizScore === totalQuestions) {
            msgEl.innerText = "완벽합니다!";
            descEl.innerText = "모든 문제를 맞히셨습니다. 옥텟 규칙과 VSEPR 분자 기하구조 이론을 완벽하게 이해하고 계십니다!";
        } else if (quizScore >= 3) {
            msgEl.innerText = "훌륭합니다!";
            descEl.innerText = "대부분의 개념을 올바르게 알고 있습니다. 틀린 부분은 해설을 참고하여 학습해 보세요.";
        } else {
            msgEl.innerText = "조금 더 연습해봐요!";
            descEl.innerText = "분자 조립 모드로 돌아가 여러 결합들을 직접 제작해 보며 기하 구조 정보를 관찰해 보세요.";
        }
        
        // Show progress at 100% on results
        progressBar.style.width = '100%';
        progressText.innerText = '완료';
        return;
    }

    // Show main card
    mainCard.classList.remove('hidden');
    resultsPanel.classList.add('hidden');

    const qData = state.quizQuestions[currentQuizIndex];
    
    // Update progress
    const progressPercent = (currentQuizIndex / totalQuestions) * 100;
    progressBar.style.width = `${progressPercent}%`;
    progressText.innerText = `문제 ${currentQuizIndex + 1} / ${totalQuestions}`;

    // Render text with dynamic question numbering
    questionEl.innerText = `${currentQuizIndex + 1}. ${qData.question}`;

    // Render options
    optionsEl.innerHTML = '';
    quizAnswered = false;

    qData.options.forEach((optText, index) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option-btn';
        btn.innerText = optText;
        btn.addEventListener('click', () => handleQuizAnswer(index, btn));
        optionsEl.appendChild(btn);
    });
}

function handleQuizAnswer(selectedIdx, clickedBtn) {
    if (quizAnswered) return;
    quizAnswered = true;

    const qData = state.quizQuestions[currentQuizIndex];
    const optionsEl = document.getElementById('quiz-options');
    const buttons = optionsEl.querySelectorAll('.quiz-option-btn');
    const feedbackBox = document.getElementById('quiz-feedback-box');
    const fbIcon = document.getElementById('feedback-icon');
    const fbTitle = document.getElementById('feedback-title');
    const fbDesc = document.getElementById('feedback-explanation');

    // Disable choices
    buttons.forEach(btn => btn.disabled = true);

    const isCorrect = (selectedIdx === qData.answer);

    if (isCorrect) {
        quizScore++;
        clickedBtn.classList.add('correct');
        feedbackBox.classList.add('correct-box');
        fbIcon.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#34c759; font-size: 1.2rem;"></i>';
        fbTitle.innerText = "정답입니다!";
    } else {
        clickedBtn.classList.add('wrong');
        buttons[qData.answer].classList.add('correct');
        feedbackBox.classList.add('wrong-box');
        fbIcon.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#ff3b30; font-size: 1.2rem;"></i>';
        fbTitle.innerText = "오답입니다.";
    }

    fbDesc.innerText = qData.explanation;
    feedbackBox.classList.remove('hidden');
}

function setupQuizEvents() {
    // Next Button
    document.getElementById('btn-next-question').addEventListener('click', () => {
        currentQuizIndex++;
        renderQuiz();
    });

    // Restart Button
    document.getElementById('btn-restart-quiz').addEventListener('click', () => {
        initQuizSession();
        renderQuiz();
    });
}
