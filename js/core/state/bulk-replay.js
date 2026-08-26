// Bulk Replay State Management
export const bulkReplayState = {
    bulkReplayTemplate: '',
    positionConfigs: [],
    batteringRamConfig: {
        type: 'simple-list',
        list: '',
        numbers: { from: 1, to: 10, step: 1 }
    },
    currentAttackType: 'sniper',
    shouldStopBulk: false,
    shouldPauseBulk: false
};

