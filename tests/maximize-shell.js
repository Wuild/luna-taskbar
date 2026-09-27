import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const rect = r => ({x:r.x, y:r.y, width:r.width, height:r.height});
function assert(value, message) { if (!value) throw new Error(message); }
export async function run() {
    await Scripting.sleep(1800);
    Main.overview.hide();
    const runtime = Main.extensionManager.lookup('luna-taskbar@wuild').stateObj.runtime;
    const settings = runtime._settings;
    new Gio.Settings({schema_id:'org.gnome.desktop.interface'}).set_boolean('enable-animations', true);
    const launcher = new Gio.SubprocessLauncher({flags:Gio.SubprocessFlags.NONE});
    launcher.set_environ(global.create_app_launch_context(0,-1).get_environment());
    launcher.setenv('GDK_BACKEND','wayland',true);
    const child = launcher.spawnv(['python3', `${GLib.getenv('LUNA_TEST_ROOT')}/tests/arcmenu-fullscreen.py`]);
    try {
        let window;
        for (let i=0;i<50 && !window;i++) {
            await Scripting.sleep(100);
            window = global.display.list_all_windows().find(w=>w.get_title()==='ArcMenu fullscreen regression');
        }
        assert(window, 'Test application mapped');
        window.unmake_fullscreen();
        await Scripting.sleep(400);
        settings.set_string('visibility-mode','always');
        settings.set_boolean('taskbar-floating',true);
        settings.set_int('taskbar-edge-gap',12);
        settings.set_string('window-appearance-layout','attached');
        const actor = window.get_compositor_private();
        for (const mode of (Main.layoutManager.monitors.length > 1 ? ['inherit','stock'] : ['disabled','maximized','inherit','stock'])) {
            if (mode === 'stock') {
                if (Main.layoutManager.monitors.length > 1) {
                    const monitor = Main.layoutManager.monitors[0];
                    window.move_to_monitor(monitor.index);
                    window.move_resize_frame(false, monitor.x + monitor.width - 100, monitor.y + 180, 640, 400);
                    await Scripting.sleep(200);
                    window.maximize();
                    await Scripting.sleep(400);
                    window.unmaximize();
                    await Scripting.sleep(80);
                    assert(!actor.has_clip, 'A restored window spanning displays remains unclipped');
                    await Scripting.sleep(350);
                    window.move_resize_frame(false, monitor.x + 240, monitor.y + 180, 640, 400);
                    await Scripting.sleep(200);
                    window.maximize();
                    await Scripting.sleep(400);
                    window.unmaximize();
                    await Scripting.sleep(80);
                    assert(actor.has_clip, 'Restore clip is active before extension teardown');
                }
                Main.extensionManager.disableExtension('luna-taskbar@wuild');
                await Scripting.sleep(400);
                assert(Main.extensionManager.lookup('luna-taskbar@wuild').state !== 1, 'Stock comparison disables Luna');
                assert(!actor.has_clip, 'Disabling Luna mid-animation restores the original clip');
            } else {
                settings.set_string('window-appearance-mode',mode === 'inherit' ? 'maximized' : mode);
                settings.set_string('window-appearance-layout',mode === 'inherit' ? 'inherit' : 'attached');
                settings.set_boolean('taskbar-floating',mode !== 'inherit');
            }
            for (const monitor of Main.layoutManager.monitors) {
                window.move_to_monitor(monitor.index);
                const normalX = monitor.x + 240, normalY = monitor.y + 180;
                for (const edge of (['inherit','stock'].includes(mode) ? ['bottom'] : ['bottom','top','left','right'])) {
                    settings.set_string('taskbar-position',edge);
                    await Scripting.sleep(350);
                    window.move_resize_frame(false,normalX,normalY,640,400);
                    await Scripting.sleep(200);
                    for (const maximize of [true,false]) {
                        const events=[];
                        const start = GLib.get_monotonic_time();
                        const record = kind=>events.push({kind,t:Math.round((GLib.get_monotonic_time()-start)/1000),
                            frame:rect(window.get_frame_rect()),work:rect(Main.layoutManager.getWorkAreaForMonitor(monitor.index)),
                            resizing:!!actor.__animationInfo, x:actor.x,y:actor.y,tx:actor.translation_x,ty:actor.translation_y});
                        const workId=global.display.connect('workareas-changed',()=>record('work'));
                        const sizeId=window.connect('size-changed',()=>record('size'));
                        const samples=[];
                        // Sample painted frames; timer callbacks can observe pre-allocation geometry.
                        const sampleId=global.stage.connect('after-paint', ()=>{
                            const [x,y]=actor.get_transformed_position(),[width,height]=actor.get_transformed_size();
                            const clip = actor.has_clip ? actor.get_clip() : null;
                            const sx = width / actor.width, sy = height / actor.height;
                            samples.push({x: clip ? Math.max(x, x + clip[0] * sx) : x,
                                y: clip ? Math.max(y, y + clip[1] * sy) : y,
                                right: clip ? Math.min(x + width, x + (clip[0] + clip[2]) * sx) : x + width,
                                bottom: clip ? Math.min(y + height, y + (clip[1] + clip[3]) * sy) : y + height,
                                clipped: !!clip, cloneClipped: !!actor.__animationInfo?.clone?.has_clip});
                        });
                        record('before');
                        if(maximize) window.maximize(); else window.unmaximize();
                        await Scripting.sleep(600);
                        global.stage.disconnect(sampleId);
                        record('after');
                        if (!maximize && mode !== 'stock' && Main.layoutManager.monitors.length > 1) {
                            assert(samples.some(sample=>sample.clipped), 'Multi-monitor restore is clipped while animating');
                            assert(samples.filter(sample=>sample.clipped).every(sample=>sample.cloneClipped),
                                'Temporary animation clone is bounded with the live window');
                            assert(samples.every(sample=>sample.x >= monitor.x - 1 && sample.y >= monitor.y - 1 &&
                                sample.right <= monitor.x + monitor.width + 1 && sample.bottom <= monitor.y + monitor.height + 1),
                                'Restore never paints outside its original monitor');
                            assert(!actor.has_clip, 'Restore releases the window clip after the animation');
                        }
                        print(`MAXIMIZE_BOUNDS ${mode} monitor=${monitor.index} ${edge} ${maximize} ${JSON.stringify({
                            left:Math.min(...samples.map(s=>s.x)),top:Math.min(...samples.map(s=>s.y)),
                            right:Math.max(...samples.map(s=>s.right)),bottom:Math.max(...samples.map(s=>s.bottom))})}`);
                        global.display.disconnect(workId);window.disconnect(sizeId);
                        print(`MAXIMIZE_TRACE ${mode} monitor=${monitor.index} ${edge} ${maximize} ${JSON.stringify(events)}`);
                        if (mode !== 'maximized')
                            assert(!events.some(event=>event.kind==='work'), 'Stable layouts do not change work area during maximize/restore');
                        const frame=window.get_frame_rect(),work=Main.layoutManager.getWorkAreaForMonitor(monitor.index);
                        if(maximize) assert(frame.x===work.x && frame.y===work.y && frame.width===work.width && frame.height===work.height,'Maximized frame matches work area');
                        if (!maximize) assert(frame.x===normalX && frame.y===normalY && frame.width===640 && frame.height===400, 'Restore preserves normal window geometry');
                        assert(actor.translation_x===0 && actor.translation_y===0 && actor.scale_x===1 && actor.scale_y===1,'Window animation settles');
                    }
                }
            }
        }
        print('LUNA_MAXIMIZE_PASS');
    } finally { child.force_exit(); }
}
