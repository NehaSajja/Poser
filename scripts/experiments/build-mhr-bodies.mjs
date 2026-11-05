import {spawnSync} from 'node:child_process';
import {BODY_PRESETS} from '../../src/poser2/bodyShape.js';
const run=spawnSync('.local/mhr-env/bin/python',['scripts/experiments/build-mhr-bodies.py'],{stdio:'inherit',env:{...process.env,MHR_DEFAULT_SHAPE:JSON.stringify(BODY_PRESETS.feminine)}});
process.exit(run.status??1);
