import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Lifecycle} from '../dist/core/lifecycle.js';
import {buildTasks} from '../dist/appbar/model.js';

test('teardown releases every resource in reverse order even when one cleanup fails', () => {
    const scope = new Lifecycle();
    const released = [];
    scope.add(() => released.push('first'));
    scope.add(() => { released.push('second'); throw new Error('failed'); });
    scope.add(() => released.push('third'));
    assert.throws(() => scope.destroy(), AggregateError);
    assert.deepEqual(released, ['third', 'second', 'first']);
    scope.destroy();
    scope.add(() => released.push('late'));
    assert.deepEqual(released, ['third', 'second', 'first', 'late']);
});

test('duplicate favorites and missing app IDs do not create duplicate or invalid launchers', () => {
    const app = {get_id: () => 'test.desktop'};
    const window = {id: 1};
    const tasks = buildTasks([app, app, {get_id: () => null}], [window], () => app);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].window, window);
});

const {taskbarGeometry, reserveGeometry} = await import('../dist/taskbar/geometry.js');
test('floating geometry supports every edge, negative monitor origins, and clamps excessive gaps', () => {
    const monitor = {x: -1920, y: 80, width: 1920, height: 1080};
    for (const edge of ['bottom', 'top', 'left', 'right']) {
        const bar = taskbarGeometry(monitor, edge, 48, true, 12, 20);
        const reserve = reserveGeometry(monitor, bar, edge);
        const vertical = edge === 'left' || edge === 'right';
        assert.equal(vertical ? bar.width : bar.height, 48);
        assert.equal(vertical ? bar.height : bar.width, (vertical ? monitor.height : monitor.width) - 40);
        assert.equal(vertical ? reserve.width : reserve.height, 72);
        const attached = reserveGeometry(monitor, taskbarGeometry(monitor, edge, 48, false, 12, 20), edge);
        assert.equal(vertical ? attached.width : attached.height, 48);
        const clamped = taskbarGeometry(monitor, edge, 48, true, 9999, 9999);
        assert.ok(clamped.width > 0 && clamped.height > 0);
        assert.ok(clamped.x >= monitor.x && clamped.y >= monitor.y);
        assert.ok(clamped.x + clamped.width <= monitor.x + monitor.width);
        assert.ok(clamped.y + clamped.height <= monitor.y + monitor.height);
    }
});
