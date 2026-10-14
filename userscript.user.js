// ==UserScript==
// @name         MagicalDraw - Tracer
// @namespace    https://github.com/grmpnk
// @version      1.1
// @description  MagicalDraw でトレースを簡単にする拡張機能です
// @author       grmpneko
// @match        http*://*/*
// @match        https://draw.kuku.lu/room/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kuku.lu
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-start
// @license      MIT
// ==/UserScript==
// ==========================================
// ユーティリティ/ファクトリ関数
// ==========================================
let w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, d = document, l = console.log;let $S = s => document.querySelector(s), $SA = s => document.querySelectorAll(s);let $C = (tag, { attrs = {}, props = {}, styles = {}, on = {} } = {}) => {const el = document.createElement(tag);for(const [name, value] of Object.entries(attrs)){if(value === false || value == null) continue;if(value === true){el.setAttribute(name, "");}else el.setAttribute(name, String(value));}Object.assign(el, props); Object.assign(el.style, styles);for(const [ev, handler] of Object.entries(on)){if(typeof handler === "function") el.addEventListener(ev, handler);}return el;};
let attempts = 0;
// ==========================================
// メイン
// ==========================================
if (location.href.startsWith("https://draw.kuku.lu/room/")) {
    const iv = setInterval(() => {
        if (++attempts > 50) {
            clearInterval(iv);
            return;
        }

        const container = $S("#area-palette-colorpicker");
        if (!container) return;

        clearInterval(iv);

        if ($S("#area-palette-trace")) return;

        const traceBtn = $C("tr");
        const traceCell = $C("td", {
            attrs: {
                id: "area-palette-trace",
                valign: "center",
                onselectstart: "return false"
            },
            styles: {
                borderTop: "1px solid #eeeeee"
            }
        });

        const menu = $C("div", {
            attrs: {
                class: "palette_menu"
            },
            props: {
                textContent: "＋トレース"
            },
            styles: {
                cursor: "pointer"
            },
            on: {
                click: () => {
                    data.style.display =
                        data.style.display === "none" ? "block" : "none";
                }
            }
        });

        const data = $C("div", {
            attrs: {
                id: "area-palette-trace-data"
            },
            styles: {
                display: "none",
            }
        });

        const controls = $C("div", {
            styles: {
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                marginBottom: "8px"
            }
        });

        const fileInput = $C("input", {
            attrs: {
                type: "file",
                accept: "image/*",
                multiple: true
            },
            styles: {
                maxWidth: "100%"
            }
        });

        const dropArea = $C("div", {
            props: {
                textContent: "ここに画像ファイルや他サイトの画像をドロップ"
            },
            styles: {
                border: "1px dashed #999",
                padding: "12px",
                textAlign: "center",
                fontSize: "12px"
            },
            on: {
                dragover: event => {
                    event.preventDefault();
                    dropArea.style.background = "#eeeeee";
                },
                dragleave: () => {
                    dropArea.style.background = "";
                },
                drop: event => {
                    event.preventDefault();
                    dropArea.style.background = "";

                    const files = [...event.dataTransfer.files]
                    .filter(file => file.type.startsWith("image/"));

                    for (const file of files) addImage(URL.createObjectURL(file));

                    if (!files.length) {
                        const urls = [...event.dataTransfer.getData("text/uri-list")
                                      .split(/\r?\n/), event.dataTransfer.getData("text/plain")]
                        .map(value => value.trim())
                        .filter(value => /^https?:\/\/\S+$/i.test(value));

                        for (const url of new Set(urls)) addImage(url);
                    }
                }
            }
        });

        const imageList = $C("div", {
            styles: {
                display: "flex",
                flexDirection: "column",
                gap: "12px"
            }
        });

        const overlays = new Set();
        let lastKey = "";

        const overlayContainer = $C("div", {
            attrs: {
                id: "area-palette-trace-overlays"
            },
            styles: {
                position: "fixed",
                left: "0",
                top: "0",
                width: "100px",
                height: "100px",
                pointerEvents: "none",
                zIndex: "99999"
            }
        });

        d.body.appendChild(overlayContainer);

        const updateOverlayPosition = force => {
            const currentGuide = $S("#cvws_guide");
            if (!currentGuide) return;

            const rect = currentGuide.getBoundingClientRect();
            const origin = overlayContainer.getBoundingClientRect();
            const key = [
                rect.left, rect.top, rect.width, rect.height,
                origin.left, origin.top, origin.width, origin.height
            ].join("|");

            if (!force && key === lastKey) return;
            lastKey = key;

            const sx = origin.width / 100 || 1;
            const sy = origin.height / 100 || 1;

            for (const overlay of overlays) {
                overlay.style.left = `${(rect.left - origin.left) / sx}px`;
                overlay.style.top = `${(rect.top - origin.top) / sy}px`;
                overlay.style.width = `${rect.width / sx}px`;
                overlay.style.height = `${rect.height / sy}px`;
            }
        };

        const tick = () => {
            updateOverlayPosition(false);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        const makeSlider = (labelText, min, max, value, step, callback) => {
            const wrapper = $C("label", {
                attrs: {
                    class: "trace-slider-row"
                }
            });

            const label = $C("span", {
                attrs: {
                    class: "trace-slider-label"
                },
                props: {
                    textContent: labelText
                }
            });

            const slider = $C("input", {
                attrs: {
                    class: "trace-slider-input",
                    type: "range",
                    min,
                    max,
                    step,
                    value
                }
            });

            const output = $C("span", {
                attrs: {
                    class: "trace-slider-output"
                },
                props: {
                    textContent: String(value)
                }
            });

            slider.addEventListener("input", () => {
                output.textContent = slider.value;
                callback(Number(slider.value));
                updateOverlayPosition(true);
            });

            wrapper.append(label, slider, output);
            return wrapper;
        };

        let traceImageId = 0;

        const addImage = url => {
            const currentGuide = $S("#cvws_guide");
            if (!currentGuide) return;

            const id = `area-palette-trace-item-${++traceImageId}`;

            const overlay = $C("div", {
                attrs: {
                    "data-trace-id": id
                },
                styles: {
                    position: "absolute",
                    left: "0",
                    top: "0",
                    width: "0",
                    height: "0",
                    pointerEvents: "none",
                    overflow: "visible"
                }
            });

            const img = $C("img", {
                attrs: {
                    src: url,
                    draggable: "false"
                },
                styles: {
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    transform: "translate(-50%, -50%) rotate(0deg) scale(1)",
                    transformOrigin: "center center",
                    opacity: "0.2",
                    pointerEvents: "none",
                    userSelect: "none"
                }
            });

            const state = {
                rotation: 0,
                opacity: 0.2,
                scale: 100,
                x: 0,
                y: 0,
                visible: true
            };

            const updateImage = () => {
                img.style.left = `${50 + state.x * 100}%`;
                img.style.top = `${50 + state.y * 100}%`;
                img.style.transform =
                    `translate(-50%, -50%) rotate(${state.rotation}deg) scale(${state.scale / 100})`;
                img.style.opacity = String(state.opacity);
            };

            const preview = $C("img", {
                attrs: {
                    src: url,
                    draggable: "false",
                    alt: "トレース画像プレビュー"
                },
                styles: {
                    display: "block",
                    maxWidth: "100%",
                    maxHeight: "140px",
                    objectFit: "contain",
                    cursor: "move",
                    userSelect: "none",
                    margin: "0 auto"
                }
            });

            const visibility = $C("input", {
                attrs: {
                    type: "checkbox",
                    checked: true
                },
                props: {
                    checked: true
                }
            });

            const visibilityLabel = $C("label", {
                styles: {
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px"
                }
            });

            visibilityLabel.append(
                visibility,
                d.createTextNode(`画像を表示 ${traceImageId}`)
            );

            const item = $C("div", {
                attrs: {
                    id
                },
                styles: {
                    border: "1px solid #ddd",
                    padding: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                }
            });

            const removeButton = $C("button", {
                attrs: {
                    type: "button"
                },
                props: {
                    textContent: "画像を削除"
                },
                on: {
                    click: () => {
                        overlays.delete(overlay);
                        overlay.remove();
                        item.remove();

                        if (url.startsWith("blob:")) {
                            URL.revokeObjectURL(url);
                        }
                    }
                }
            });

            visibility.addEventListener("change", () => {
                state.visible = visibility.checked;
                overlay.style.display = state.visible ? "block" : "none";

                for (const child of item.children) {
                    if (child !== visibilityLabel) {
                        child.style.display = visibility.checked ? "" : "none";
                    }
                }
            });

            let dragging = false;
            let startX = 0;
            let startY = 0;
            let initialX = 0;
            let initialY = 0;

            preview.addEventListener("pointerdown", event => {
                if (event.button !== 0) return;

                event.preventDefault();
                dragging = true;
                startX = event.clientX;
                startY = event.clientY;
                initialX = state.x;
                initialY = state.y;

                preview.setPointerCapture(event.pointerId);
            });

            preview.addEventListener("pointermove", event => {
                if (!dragging) return;

                const currentGuide = $S("#cvws_guide");
                if (!currentGuide) return;

                const rect = currentGuide.getBoundingClientRect();
                if (!rect.width || !rect.height) return;

                state.x = initialX + (event.clientX - startX) / rect.width;
                state.y = initialY + (event.clientY - startY) / rect.height;

                updateImage();
                updateOverlayPosition(true);
            });

            const stopDragging = () => {
                dragging = false;
            };

            preview.addEventListener("pointerup", stopDragging);
            preview.addEventListener("pointercancel", stopDragging);
            preview.addEventListener("lostpointercapture", stopDragging);

            item.append(
                visibilityLabel,
                preview,
                makeSlider("回転", -180, 180, 0, 1, value => {
                    state.rotation = value;
                    updateImage();
                }),
                makeSlider("不透明度", 0, 1, 0.2, 0.01, value => {
                    state.opacity = value;
                    updateImage();
                }),
                makeSlider("画像倍率", 10, 300, 100, 1, value => {
                    state.scale = value;
                    updateImage();
                }),
                removeButton
            );

            overlay.appendChild(img);
            overlayContainer.appendChild(overlay);
            overlays.add(overlay);
            imageList.appendChild(item);

            img.addEventListener("error", () => {
                item.style.borderColor = "#c00";
            }, { once: true });

            updateOverlayPosition(true);
        };

        fileInput.addEventListener("change", () => {
            for (const file of fileInput.files) {
                if (file.type.startsWith("image/")) {
                    addImage(URL.createObjectURL(file));
                }
            }
            fileInput.value = "";
        });

        controls.append(fileInput, dropArea);
        data.append(controls, imageList);
        traceCell.append(menu, data);
        traceBtn.appendChild(traceCell);
        container.parentElement.appendChild(traceBtn);
    }, 200);
}
// ==========================================
// トレース素材
// ==========================================
if (location.href.startsWith("https://draw.kuku.lu/room/")) {
    w.onload=()=>{
        const links = [
            ["https://a.favicon.im/tools.oyasumi-gamedev.com", "https://tools.oyasumi-gamedev.com/rokehan/#ll=35.659500%2C139.700500&s=300&far=2&n=%E6%B8%8B%E8%B0%B7%E3%82%B9%E3%82%AF%E3%83%A9%E3%83%B3%E3%83%96%E3%83%AB%E4%BA%A4%E5%B7%AE%E7%82%B9", "どこでもロケハン"],
            ["https://a.favicon.im/www.pixiv.net", "https://www.pixiv.net/", "pixiv"],
            ["https://a.favicon.im/studio.tripo3d.ai", "https://studio.tripo3d.ai/?category=featured&model_type=all&page_type=1.2&recommended=recommended&use_case=all", "tripo3d"],
            ["https://a.favicon.im/avatarmaker.vket.com", "https://avatarmaker.vket.com/edit", "avatarmaker"],
            ["https://a.favicon.im/gallery.feather.art", "https://gallery.feather.art/", "feather art"],
            ["https://a.favicon.im/www.youtube.com", "https://www.youtube.com/results?search_query=MMD+4K", "MMD YouTube"],
            ["https://a.favicon.im/www.youtube.com", "https://www.youtube.com/results?search_query=%E3%82%AA%E3%83%BC%E3%83%97%E3%83%8B%E3%83%B3%E3%82%B0", "OP YouTube"],
            ["https://a.favicon.im/jp.pinterest.com", "https://jp.pinterest.com/", "pinterest"],
            ["https://a.favicon.im/pose-maker.com", "https://pose-maker.com/poses", "ポーズメーカー"],
            ["https://a.favicon.im/www.posemaniacs.com", "https://www.posemaniacs.com/ja", "posemaniacs"]
        ];
        const nav = $S("#nav > div");
        if(nav){
            const panel = $C("div", {
                styles: {
                    display: "none",
                    position: "absolute",
                    top: "100%",
                    left: "0",
                    zIndex: "9999",
                    background: "#fff",
                    color: "#000",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    padding: "4px"
                }
            });
            for(const [fav, url, label] of links){
                const item = $C("div", {
                    styles: {
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 8px",
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                    },
                    on: {
                        click: e => {
                            e.stopPropagation();
                            open(url, "_blank", "noopener");
                        }
                    }
                });
                const icon = $C("img", {
                    attrs: {
                        src: fav,
                        width: 16,
                        height: 16
                    }
                });
                const text = $C("span", { props: { textContent: label } });
                item.append(icon, text);
                panel.append(item);
            }
            const btn = $C("div", {
                attrs: { class: "nav_btn" },
                props: { textContent: "トレース素材" },
                styles: { position: "relative", cursor: "pointer" },
                on: {
                    click: e => {
                        e.stopPropagation();
                        panel.style.display = panel.style.display === "none" ? "block" : "none";
                    }
                }
            });
            btn.append(panel);
            nav.append(btn);
            d.addEventListener("click", () => {
                panel.style.display = "none";
            });
        }
    }
}
// ==========================================
// eyedropper
// ==========================================
GM_registerMenuCommand('Pick Color', pickColorAndShow);

function hexToRgb(hex) {
    const m = /^#?([0-9A-F]{6})$/i.exec(hex);
    if (!m) return null;
    const v = m[1];
    return {
        r: parseInt(v.slice(0, 2), 16),
        g: parseInt(v.slice(2, 4), 16),
        b: parseInt(v.slice(4, 6), 16),
    };
}

async function pickColorAndShow() {
    if (!window.EyeDropper) {
        alert('このブラウザでは EyeDropper はサポートされてません');
        return;
    }
    try {
        const eye = new EyeDropper();
        const { sRGBHex } = await eye.open();
        const hex = sRGBHex.toUpperCase();
        const rgb = hexToRgb(hex);
        if (!rgb) {
            alert('Failed to retrieve color: ' + hex);
            return;
        }
        const rgbText = `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        const out = `${rgbText}  ${hex.replace('#','').toLowerCase()}`;
        try {
            await navigator.clipboard.writeText(hex.replace('#','').toLowerCase());
        } catch (e) {
            console.warn('Clipboard write failed', e);
        }
        alert(out);
    } catch (err) {
        console.error('EyeDropper error', err);
        if (err && err.name !== 'AbortError') {
            alert('error: ' + (err && err.message ? err.message : err));
        }
    }
}
// ==========================================
// mousedown event - canvas/video要素を画像に起こす
// ==========================================
if (!location.href.startsWith("https://draw.kuku.lu/room/")) {
    let timer = null, box = null;

    const proto = w.HTMLCanvasElement.prototype, origGetContext = proto.getContext;
    proto.getContext = function(type, ...rest){
        if(typeof type === 'string' && type.includes('webgl')){
            rest[0] = Object.assign({}, rest[0], { preserveDrawingBuffer: true });
        }
        return origGetContext.call(this, type, ...rest);
    };

    const removeBox = () => {
        if(box){
            box.remove();
            box = null;
        }
    };

    const isMedia = n => n instanceof HTMLCanvasElement || n instanceof HTMLVideoElement;
    const findMedia = e => e.composedPath().find(isMedia) || d.elementsFromPoint(e.clientX, e.clientY).find(isMedia);

    const toUrl = el => {
        if(el instanceof HTMLCanvasElement) return el.toDataURL('image/png');
        if(!el.videoWidth || !el.videoHeight) return null;
        const c = $C('canvas', { props: { width: el.videoWidth, height: el.videoHeight } });
        c.getContext('2d').drawImage(el, 0, 0);
        return c.toDataURL('image/png');
    };

    const showBox = (el, x, y) => {
        let url;
        try{
            url = toUrl(el);
        }catch{
            return;
        }
        if(!url) return;
        removeBox();
        const img = $C('img', {
            props: { src: url, draggable: true },
            styles: { display: 'block', maxWidth: '300px', maxHeight: '300px', cursor: 'grab' }
        });
        box = $C('div', {
            attrs: { id: 'grmp-box' },
            styles: {
                position: 'absolute',
                left: `${x + 10}px`,
                top: `${y + 10}px`,
                zIndex: '2147483647',
                padding: '4px',
                background: '#888',
                border: '1px solid #444',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
            }
        });
        box.appendChild(img);
        d.body.appendChild(box);
    };

    const onDown = e => {
        if(box && !e.composedPath().includes(box)) removeBox();
        if(e.button !== 0) return;
        const el = findMedia(e);
        if(!el) return;
        const x = e.pageX, y = e.pageY;
        clearTimeout(timer);
        if(e.ctrlKey){
            showBox(el, x, y);
            return;
        }
        timer = setTimeout(() => showBox(el, x, y), 1000);
    };

    const onUp = () => clearTimeout(timer);

    for(const type of ['pointerdown', 'mousedown']) window.addEventListener(type, onDown, true);
    for(const type of ['pointerup', 'mouseup']) window.addEventListener(type, onUp, true);
}
// ==========================================
// CSS
// ==========================================
GM_addStyle(`
#win_palette,#win_chat { z-index: 100000 !important;}
#area-palette-trace-data .trace-slider-row {
    display: flex;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 6px !important;
    width: 100% !important;
    font-size: 12px !important;
    white-space: nowrap !important;
}
#area-palette-trace-data .trace-slider-row > * {
    display: inline-block !important;
    float: none !important;
    margin: 0 !important;
    vertical-align: middle !important;
}
#area-palette-trace-data .trace-slider-label {
    flex: 0 0 56px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}
#area-palette-trace-data .trace-slider-input {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    width: auto !important;
}
#area-palette-trace-data .trace-slider-output {
    flex: 0 0 40px !important;
    text-align: right !important;
}
`)
