(function installMotionGuidance(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixoMotionGuidance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function motionGuidanceFactory() {
  "use strict";
  const WHITE = "#f0f3eb", GREEN = "#c8ff3d", INK = "#101b13", TAU = Math.PI * 2;
  const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, Number(v) || 0));
  const ease = v => { v = clamp(v); return v * v * (3 - 2 * v); };
  const mix = (a, b, v) => a + (b - a) * v;
  const DIRECTIONS = { left: [-1, 0, "left"], right: [1, 0, "right"], up: [0, -1, "up"], down: [0, 1, "down"] };
  const HANDS = {
    hand_victory: "V sign", hand_thumb_up: "Thumbs up", hand_thumb_down: "Thumbs down",
    hand_open_palm: "Open palm", hand_closed_fist: "Make a fist", hand_pointing_up: "Point up",
    hand_i_love_you: "Thumb, index, pinky", hand_finger_snap: "Keep snapping fingers", hand_finger_gun_recoil: "Finger gun, repeat",
  };
  const FACES = {
    face_smile: "Smile", face_wink_left: "Wink your left eye", face_wink_right: "Wink your right eye",
    face_blink: "Blink both eyes", face_mouth_open: "Open mouth", face_mouth_pucker: "Pucker lips",
    face_brow_raise: "Raise brows", face_brow_furrow: "Furrow brows", face_cheek_puff: "Puff cheeks",
  };
  const SIMPLE = {
    tap: ["tap", "Tap", 1, 1.55], double_tap: ["tap", "Double tap", 2, 1.55], rapid_tap: ["tap", "Tap 3 times", 3, 1.55], multi_tap: ["tap", "Tap required times", 3, 1.55],
    continuous_tap: ["tap", "Keep tapping", 0, .35], hold: ["hold", "Press & hold", 0, 2.4], continuous_hold: ["hold", "Hold to play", 0, 2.4], hold_charge: ["charge", "Hold to charge", 0, 2.4],
    continuous_swipe: ["flow", "Swipe back & forth", 0, .6], draw_circle: ["circle", "Draw a circle", 0, 1.65], erase: ["erase", "Rub to erase", 0, 1.8],
    hold_still: ["still", "Hold phone still", 0, 2.4], tilt_left: ["tilt", "Tilt phone left", 0, 1.9], tilt_right: ["tilt", "Tilt phone right", 0, 1.9],
    tilt_forward: ["pitch", "Tilt phone forward", 0, 1.9], tilt_backward: ["pitch", "Tilt phone backward", 0, 1.9],
    shake: ["shake", "Shake phone", 0, .65], mic_level: ["voice", "Make a sound", 0, 1.7], mic_level_continuous: ["voice", "Keep pitch steady", 0, 1.2],
    mic_blow: ["blow", "Blow into mic", 0, 1.65], mic_blow_continuous: ["blow", "Keep blowing", 0, .8],
    mic_clap: ["clap", "Clap once", 0, 1.8], mic_quiet: ["quiet", "Stay quiet", 0, 2.4],
  };
  const SUSTAINED = new Set(["continuous_tap", "continuous_swipe", "continuous_hold", "camera_continuous", "mic_level_continuous", "mic_blow_continuous"]);

  // Every leaf has its own pose/direction and timeline. Preset IDs remain protocol IDs.
  function resolve(cue) {
    const type = cue.type, detection = cue.detection || {}, spec = SIMPLE[type];
    const model = { id: type, type, kind: spec ? spec[0] : "fallback", copy: spec ? spec[1] : "Follow the prompt",
      count: spec ? spec[2] : 0, period: spec ? spec[3] : 1.8, sustained: SUSTAINED.has(type),
      dx: 1, dy: 0, sign: 1, sensor: /^(mic_|camera_|tilt_|rotate|shake|hold_still)/.test(type) };
    const match = /^(swipe|drag|scrub)_(left|right|up|down)$/.exec(type);
    if (match) {
      const d = DIRECTIONS[match[2]];
      model.kind = match[1]; model.dx = d[0]; model.dy = d[1];
      model.period = model.kind === "swipe" ? 1.35 : model.kind === "drag" ? 2 : 2.1;
      model.copy = model.kind === "swipe" ? `Swipe ${d[2]}` : model.kind === "drag" ? `Hold & drag ${d[2]}` : `Rub, release ${d[2]}`;
    }
    if (type === "pinch") {
      model.outward = detection.pinch_direction === "outward"; model.kind = "pinch"; model.period = 1.8;
      model.copy = model.outward ? "Spread two fingers" : "Pinch two fingers"; model.id = model.outward ? "pinch_out" : "pinch_in";
    }
    if (type === "multi_tap") {
      const count = Number(detection.required_tap_count);
      model.count = Number.isInteger(count) && count >= 1 && count <= 99 ? count : 3;
      model.copy = `Tap ${model.count} times`;
    }
    if (type === "rotate") {
      // Legacy rotate without a direction uses the catalog's counterclockwise default.
      model.sign = detection.rotation_direction === "clockwise" ? 1 : -1; model.kind = "rotate"; model.period = 2.1;
      model.copy = model.sign < 0 ? "Counterclockwise" : "Clockwise";
      model.id = model.sign < 0 ? "rotate_counterclockwise" : "rotate_clockwise";
    }
    if (type === "tilt_left" || type === "tilt_backward") model.sign = -1;
    if (type === "camera_motion" || type === "camera_continuous") {
      model.target = detection.vision && detection.vision.target || (type === "camera_continuous" ? "hand_finger_snap" : "hand_open_palm");
      model.id = `${type}.${model.target || "unknown"}`;
      model.kind = FACES[model.target] ? "face" : HANDS[model.target] ? "hand" : "fallback";
      model.copy = FACES[model.target] || HANDS[model.target] || "Follow the prompt";
      model.period = model.sustained ? model.target === "hand_finger_snap" ? .9 : .75 : /wink|blink/.test(model.target) ? 1.55 : 2.1;
      if(type === "camera_motion") {
        const stable=Number(detection.vision && detection.vision.stable_for_ms);
        model.poseHold=(stable>=150 && stable<=3000 ? stable : 400)/1000+.06;
        model.period=Math.max(model.period,model.poseHold+1.05);
      }
    }
    model.description = model.target === "hand_finger_gun_recoil"
      ? "Extend your index finger, raise your thumb and curl the other three fingers. Repeatedly raise your wrist and return to keep the video playing."
      : model.target === "hand_i_love_you" ? "Extend your thumb, index finger and little finger. Bend your middle and ring fingers."
      : model.target === "hand_finger_snap" ? "Press your thumb against your middle finger, then snap your middle finger toward your palm. Keep snapping to keep the video playing."
      : model.kind === "rotate" ? `Rotate your phone ${model.sign < 0 ? "counterclockwise" : "clockwise"} as you face its screen.`
      : model.kind === "pitch" ? `${model.copy} as you face its screen.`
      : model.kind === "scrub" ? `Swipe back and forth, then release on the ${DIRECTIONS[match[2]][2]} side.`
      : model.target === "face_wink_left" ? "Close your left eye and keep your right eye open."
      : model.target === "face_wink_right" ? "Close your right eye and keep your left eye open."
      : model.kind === "flow" ? "Swipe out and back to start playback, then keep moving. If playback pauses, swipe again to resume."
      : model.sustained ? `${model.copy} to keep the video playing.` : model.copy;
    return Object.freeze(model);
  }

  function sample(fn, count = 64) {
    const result = [];
    for (let i = 0; i <= count; i++) result.push(fn(i / count));
    return result;
  }
  function cubic(a, b, c, d, t) {
    const u = 1 - t;
    return [u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0],
      u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1]];
  }
  function pointAt(path, v) {
    const n = clamp(v) * (path.length - 1), i = Math.min(path.length - 2, Math.floor(n));
    return [mix(path[i][0], path[i+1][0], n-i), mix(path[i][1], path[i+1][1], n-i)];
  }
  function pathPart(path, from, to) {
    if (to < from) return pathPart(path, to, from).reverse();
    const result = [pointAt(path, from)];
    const lo = Math.ceil(clamp(from) * (path.length - 1)), hi = Math.floor(clamp(to) * (path.length - 1));
    for (let i = lo; i <= hi; i++) result.push(path[i]);
    result.push(pointAt(path, to)); return result;
  }

  // Geometry is prepared only on cue activation/resize, never regenerated each frame.
  function planLayout(width, height, insets, model) {
    insets = insets || {};
    const left = clamp(insets.left, 0, Math.max(0, width-120)), top = clamp(insets.top, 0, Math.max(0, height-140));
    const right = clamp(insets.right, 0, Math.max(0, width-left-120)), bottom = clamp(insets.bottom, 0, Math.max(0, height-top-140));
    const w = Math.max(1, width-left-right), h = Math.max(1, height-top-bottom);
    const x = left+w*.5, y = top+h*(model.sensor ? .42 : .55);
    const size = Math.min(w*.68, h*.65), body = Math.min(h*.55, w*.77);
    const length = (model.dy ? h : w)*.65;
    const faceSize = Math.min(168, body), handSize = Math.min(144, body), phoneSize = Math.min(120, body*.8);
    const halfHeight = model.kind === "face" ? faceSize*.57 : model.kind === "hand" || model.kind === "clap" ? handSize*.57
      : ["rotate", "still", "tilt", "shake"].includes(model.kind) ? phoneSize*.64
      : model.kind === "circle" || model.kind === "erase" ? size*.5 : model.dy ? length*.5 : model.kind === "pinch" ? 36 : model.kind === "blow" ? 48 : model.sensor ? 38 : 40;
    const textY = clamp(y+halfHeight+18, top+16, top+h-34);
    const start = [x-model.dx*length*.5, y-model.dy*length*.5], end = [x+model.dx*length*.5, y+model.dy*length*.5];
    const bend = Math.min(12, length*.045);
    const main = sample(t => cubic(start, [mix(start[0],end[0],.32)-model.dy*bend, mix(start[1],end[1],.32)+model.dx*bend],
      [mix(start[0],end[0],.7)-model.dy*bend, mix(start[1],end[1],.7)+model.dx*bend], end, t));
    const circle = sample(t => { const a = -.5*Math.PI + t*TAU*.94; return [x+Math.cos(a)*size*.5, y+Math.sin(a)*size*.5]; }, 80);
    const loop = sample(t => { const a = -.5*Math.PI + t*TAU; return [x+Math.cos(a)*size*.5, y+Math.sin(a)*size*.5]; }, 80);
    const erase = sample(t => [x+Math.sin(t*Math.PI*6)*size*.4, y-size*.29+t*size*.58], 96);
    const orbit = sample(t => { const a = -Math.PI*.55 + model.sign*t*Math.PI*1.25; return [x+Math.cos(a)*phoneSize*.72, y+Math.sin(a)*phoneSize*.72]; });
    return { x, y, size, length, faceSize, handSize, phoneSize, textY, left, top, width: w, height: h, paths: { main, circle, loop, erase, orbit } };
  }

  function information(model, snapshot) {
    let copy = model.copy;
    if (snapshot.blocked) return { copy: "Unavailable here", urgent: false };
    if (snapshot.retryReady) return { copy: "Tap to retry camera", urgent: false };
    if (snapshot.calibrating) return { copy: "Calibrating mic", urgent: false };
    if (snapshot.preparing) return { copy: model.type.indexOf("mic_") === 0 ? "Starting mic" : model.kind === "face" || model.kind === "hand" ? "Starting camera" : "Getting ready", urgent: false };
    if (model.type === "mic_level_continuous" && snapshot.meter) copy = snapshot.meter.pitch === false ? "Keep volume steady" : "Keep pitch steady";
    if (model.kind === "flow") copy = snapshot.driving ? "Keep swiping" : snapshot.continuousPhase === "return_leg" ? "Swipe back" : snapshot.hasInput && snapshot.continuousPhase !== "first_leg" ? "Keep swiping" : model.copy;
    if (model.sustained && snapshot.hasInput && !snapshot.driving && model.target === "hand_finger_gun_recoil") copy = "Keep firing";
    const urgent = !model.sustained && snapshot.remainingMs !== null && snapshot.remainingMs > 0 && snapshot.remainingMs <= 1000;
    if (urgent && snapshot.durationMs > 1000) copy += ` · ${Math.ceil(snapshot.remainingMs / 1000)}s`;
    return { copy, urgent, timeLine: urgent && snapshot.durationMs <= 1000 && !["hold", "charge", "still", "quiet"].includes(model.kind) };
  }

  function shouldDisplay(model,snapshot) {
    // Capability/error prompts take priority over a stale driving flag.
    return !model.sustained || snapshot.driving !== true || !!(snapshot.preparing || snapshot.calibrating || snapshot.blocked || snapshot.retryReady);
  }

  function captionPlacement(model, layout, snapshot, bounds, copy) {
    bounds = bounds || { left: 0, top: 0 };
    const points = snapshot.points || [];
    const follows = !model.sensor && (points.length || model.kind === "tap" && (snapshot.count > 0 || model.sustained && snapshot.driving) && snapshot.lastPoint);
    const origin = follows ? snapshot.origin || points[0] || snapshot.lastPoint : null;
    const half = Math.min((Array.from(copy).reduce((n,c) => n+(c.charCodeAt(0)>255 ? 14 : 8),0)+24)/2, (layout.width-12)/2);
    return { x: origin ? clamp(origin.x-bounds.left, layout.left+half+6, layout.left+layout.width-half-6) : layout.x,
      y: origin ? clamp(origin.y-bounds.top+40, layout.top+16, layout.top+layout.height-34) : layout.textY };
  }

  // Timelines reflect interaction cadence, rather than one shared icon wiggle.
  function actionFrame(model, seconds, reduced) {
    const phase = ((Math.max(0, seconds) % model.period) / model.period);
    let amount = ease(phase/.65), direction = 1, release = false;
    if (model.kind === "swipe") { amount = 1-Math.pow(1-clamp(phase/.62),3); release = phase>.65; }
    if (model.kind === "drag") { amount = ease((phase-.18)/.58); release = phase>.88; }
    if (model.kind === "scrub") {
      direction=phase>=.3 && phase<.62 ? -1 : 1;
      amount=phase<.3 ? ease(phase/.3) : phase<.62 ? 1-ease((phase-.3)/.32) : ease((phase-.62)/.24);
      release=phase>.88;
    }
    if (model.kind === "pinch") { amount=ease((phase-.1)/.58); release=phase>.8; }
    if (model.kind === "flow") { direction = phase<.5 ? 1 : -1; amount = .5-.5*Math.cos(phase*TAU); }
    if (model.kind === "face" || model.kind === "hand" && !model.sustained) {
      const time=phase*model.period,hold=Math.max(model.period*.45,model.poseHold || 0);
      amount=time<hold ? 1 : time<hold+.38 ? 1-ease((time-hold)/.38) : ease((time-(model.period-.42))/.42);
    }
    if (model.kind === "face" && /wink|blink/.test(model.target)) {
      const time=phase*model.period,hold=model.poseHold || .46;
      amount=time<hold ? 1 : time<hold+.28 ? 1-ease((time-hold)/.28) : ease((time-(model.period-.24))/.24);
    }
    if (model.kind === "hand" && model.sustained) amount = phase<.3 ? 0 : phase<.48 ? ease((phase-.3)/.18) : phase<.62 ? 1 : 1-ease((phase-.62)/.38);
    if (model.target === "hand_finger_snap") amount=phase<.34 ? 0 : phase<.43 ? ease((phase-.34)/.09) : phase<.64 ? 1 : 1-ease((phase-.64)/.36);
    if (model.kind === "tilt") amount = phase<.62 ? ease(phase/.62) : 1-ease((phase-.76)/.24);
    if (model.kind === "rotate") { amount=ease(phase/.65); release=phase>.83; }
    if (model.kind === "clap") amount = phase<.2 ? 0 : phase<.36 ? ease((phase-.2)/.16) : phase<.4 ? 1 : 1-ease((phase-.4)/.24);
    if (reduced) return { phase: .55, amount: 1, direction: 1, release: false };
    return { phase, amount, direction, release };
  }

  function rgba(color, alpha) {
    const hex = color.slice(1);
    return `rgba(${parseInt(hex.slice(0,2),16)},${parseInt(hex.slice(2,4),16)},${parseInt(hex.slice(4,6),16)},${clamp(alpha)})`;
  }
  function stroke(ctx, path, color = WHITE, alpha = 1, weight = 1.5) {
    if (!path.length) return;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.beginPath();
    path.forEach((p,i) => i ? ctx.lineTo(p[0],p[1]) : ctx.moveTo(p[0],p[1])); ctx.stroke(); ctx.restore();
  }
  function ring(ctx, x, y, radius, color = WHITE, alpha = 1, start = 0, end = TAU, weight = 1.5) {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = weight;
    ctx.beginPath(); ctx.arc(x,y,Math.max(.1,radius),start,end); ctx.stroke(); ctx.restore();
  }
  function ellipse(ctx,x,y,rx,ry,color,alpha) {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle=color; ctx.beginPath(); ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU); ctx.fill(); ctx.restore();
  }
  function contact(ctx,x,y,color,scale = 1,pressed = false) {
    ctx.save();
    const g = ctx.createRadialGradient(x,y,1,x,y,24*scale);
    g.addColorStop(0,rgba(color,.2)); g.addColorStop(.45,rgba(color,.1)); g.addColorStop(1,rgba(color,0));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,24*scale,0,TAU); ctx.fill();
    ellipse(ctx,x,y,pressed ? 5 : 4,pressed ? 5 : 4,color,pressed ? 1 : .72);
    ring(ctx,x,y,11*scale,INK,.35,0,TAU,3); ring(ctx,x,y,11*scale,color,.65,0,TAU,1.2); ctx.restore();
  }
  function progress(ctx,x,y,radius,ratio) {
    ring(ctx,x,y,radius,WHITE,.16,0,TAU,3);
    if (ratio>0) ring(ctx,x,y,radius,GREEN,1,-Math.PI/2,-Math.PI/2+clamp(ratio)*TAU,3);
  }
  function rounded(ctx,x,y,w,h,r) {
    r=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  }

  // One continuous tapered surface per feather layer; avoids seams and per-segment shadows.
  function ribbon(ctx,path,color,width = 20,alpha = 1,tail = true) {
    if (!path || path.length<2) return;
    const layers = [[1.7,.065,INK],[1.7,.018,color],[1.45,.025,color],[1.2,.035,color],[1,.045,color],[.8,.055,color],[.6,.07,color],[.4,.09,color]];
    ctx.save(); ctx.shadowColor="transparent"; ctx.shadowBlur=0;
    for (const layer of layers) {
      const left=[],right=[];
      path.forEach((p,i)=>{
        const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.max(.1,Math.hypot(dx,dy)),u=i/(path.length-1);
        const endFade=Math.min(1,u*12+.06,(1-u)*12+.06);
        const taper=tail ? (.08+.92*Math.pow(u,.8))*Math.min(1,(1-u)*14+.22) : Math.sqrt(endFade);
        const w=width*layer[0]*taper*.5;
        left.push([p[0]-dy/len*w,p[1]+dx/len*w]); right.push([p[0]+dy/len*w,p[1]-dx/len*w]);
      });
      const first=path[0],last=path[path.length-1];
      const g=ctx.createLinearGradient(first[0],first[1],last[0]+.01,last[1]+.01);
      g.addColorStop(0,rgba(layer[2],alpha*layer[1]*(tail ? .03 : 1)));
      g.addColorStop(.6,rgba(layer[2],alpha*layer[1]*(tail ? .4 : 1)));
      g.addColorStop(1,rgba(layer[2],alpha*layer[1]));
      ctx.fillStyle=g; ctx.beginPath(); left.forEach((p,i)=>i ? ctx.lineTo(p[0],p[1]) : ctx.moveTo(p[0],p[1]));
      right.reverse().forEach(p=>ctx.lineTo(p[0],p[1])); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function directionTip(ctx,path,color = WHITE,alpha = .8,size = 10) {
    if (path.length<2) return;
    const p=path[path.length-1],a=pointAt(path,.9),angle=Math.atan2(p[1]-a[1],p[0]-a[0]);
    ctx.save(); ctx.translate(p[0],p[1]); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(-size*.45,-size*.48); ctx.lineTo(size*.12,0); ctx.lineTo(-size*.45,size*.48);
    ctx.strokeStyle=rgba(INK,alpha*.3); ctx.lineWidth=3.5; ctx.stroke();
    ctx.strokeStyle=rgba(color,alpha); ctx.lineWidth=1.8; ctx.stroke(); ctx.restore();
  }
  function flowPath(ctx,path,head,color,width,reverse,reduced,contactHead = false) {
    ribbon(ctx,path,color,width,.17,false);
    const oriented=reverse ? path.slice().reverse() : path;
    const to=reduced ? .9 : clamp(head,.035,.97),segment=pathPart(oriented,Math.max(0,to-.55),to);
    ribbon(ctx,segment,color,width,1,true);
    // Separate the direction arrow from the touch contact instead of stacking both shapes.
    const distance=oriented.reduce((n,p,i)=>i ? n+Math.hypot(p[0]-oriented[i-1][0],p[1]-oriented[i-1][1]) : 0,0);
    const arrowTo=to-(contactHead ? Math.min(.35,19/Math.max(1,distance)) : 0);
    if(arrowTo>.05) directionTip(ctx,pathPart(oriented,Math.max(0,arrowTo-.15),arrowTo),color,.8,9);
    if(to<.72 || reduced) directionTip(ctx,oriented,color,reduced ? .35 : .5*(1-to/.85),8);
  }


  // Each pose is a single continuous silhouette. No overlapping finger tiles or square caps.
  const HAND_CONTOURS = {
    hand_open_palm: [
      ["M",-13,64],["C",-13,48,-23,39,-27,27],["C",-31,19,-45,6,-49,-3],
      ["C",-52,-10,-46,-14,-42,-7],["C",-37,0,-31,6,-25,9],
      ["C",-24,-5,-28,-39,-27,-51],["C",-27,-60,-19,-62,-18,-52],
      ["C",-17,-40,-15,-25,-13,-17],["Q",-10,-9,-9,-20],
      ["C",-8,-36,-7,-61,-5,-69],["C",-3,-77,4,-75,4,-67],
      ["C",4,-53,3,-33,6,-20],["Q",8,-12,10,-21],
      ["C",12,-32,16,-50,18,-56],["C",21,-64,28,-62,26,-54],
      ["C",23,-40,20,-24,21,-14],["Q",23,-6,26,-15],
      ["C",29,-23,32,-34,35,-39],["C",39,-45,45,-41,42,-34],
      ["C",38,-23,32,-6,32,6],["C",32,24,27,37,19,46],
      ["C",13,52,13,58,13,64],["C",5,65,-5,65,-13,64],
    ],
    hand_victory: [
      ["M",-14,64],["C",-14,47,-25,35,-28,21],["C",-32,11,-32,-3,-27,-10],
      ["C",-29,-27,-34,-50,-32,-60],["C",-31,-68,-24,-68,-23,-60],
      ["C",-21,-47,-16,-30,-12,-17],["Q",-9,-9,-7,-22],["C",-6,-37,-3,-60,-1,-69],
      ["C",1,-77,8,-76,8,-68],["C",8,-53,7,-28,10,-12],
      ["C",16,-20,24,-16,23,-8],["C",29,-14,36,-7,33,3],
      ["C",34,19,27,35,20,44],["C",14,50,14,56,14,64],["C",5,66,-5,66,-14,64],
    ],
    hand_pointing_up: [
      ["M",-14,64],["C",-14,47,-25,36,-28,22],["C",-31,11,-32,-3,-26,-11],
      ["C",-25,-30,-25,-54,-23,-64],["C",-21,-73,-15,-71,-15,-63],
      ["C",-14,-47,-14,-28,-9,-16],["C",-3,-25,8,-25,11,-16],
      ["C",19,-23,29,-15,27,-6],["C",35,-8,38,4,32,14],
      ["C",30,30,24,40,19,46],["C",14,52,14,58,14,64],["C",5,66,-5,66,-14,64],
    ],
    hand_i_love_you: [
      ["M",-14,64],["C",-14,47,-25,35,-28,22],["C",-35,14,-45,4,-50,-6],
      ["C",-56,-16,-48,-21,-42,-13],["C",-36,-7,-29,4,-24,7],
      ["C",-24,-10,-26,-42,-24,-56],["C",-23,-66,-16,-67,-16,-57],
      ["C",-15,-42,-14,-24,-9,-15],["C",-2,-25,8,-23,11,-16],
      ["C",16,-22,24,-17,25,-9],["C",28,-16,30,-36,33,-44],
      ["C",36,-52,43,-50,41,-42],["C",38,-28,33,-10,33,4],
      ["C",35,22,28,37,20,45],["C",14,51,14,58,14,64],["C",5,66,-5,66,-14,64],
    ],
    hand_closed_fist: [
      ["M",-14,64],["C",-14,46,-27,36,-30,20],["C",-35,7,-32,-7,-24,-15],
      ["C",-26,-27,-15,-34,-8,-25],["C",-4,-34,7,-34,11,-25],
      ["C",19,-32,29,-24,28,-15],["C",37,-14,39,0,34,11],
      ["C",33,28,26,40,20,46],["C",14,52,14,58,14,64],["C",5,66,-5,66,-14,64],
    ],
    hand_thumb_up: [
      ["M",-13,64],["C",-13,46,-25,34,-29,20],["C",-32,5,-27,-10,-22,-20],
      ["C",-18,-29,-17,-39,-18,-46],["C",-20,-54,-16,-60,-12,-54],
      ["C",-5,-44,-9,-31,-5,-18],["C",1,-15,16,-19,25,-13],
      ["C",33,-10,33,-2,27,1],["C",35,3,34,13,28,16],
      ["C",32,22,27,30,21,33],["C",24,40,16,45,14,49],
      ["C",11,54,12,59,12,64],["C",4,65,-5,65,-13,64],
    ],
    hand_finger_gun_recoil: [
      ["M",-14,64],["C",-14,47,-25,36,-28,22],["C",-35,15,-45,4,-49,-7],
      ["C",-54,-16,-46,-21,-40,-13],["C",-32,-5,-25,4,-21,7],
      ["C",-23,-16,-24,-47,-22,-63],["C",-21,-72,-14,-71,-14,-62],
      ["C",-13,-46,-13,-28,-7,-16],["C",0,-25,10,-24,13,-17],
      ["C",21,-24,31,-16,28,-6],["C",36,-6,38,7,32,16],
      ["C",30,30,23,41,18,47],["C",14,53,14,59,14,64],["C",5,66,-5,66,-14,64],
    ],
  };
  // A side view exposes thumb/middle pad contact. Finger bones rotate at fixed-length
  // joints; the palm and wrist do not stretch with the release.
  function jointChain(origin,lengths,angles) {
    const points=[origin];
    lengths.forEach((length,i)=>{ const p=points[points.length-1]; points.push([p[0]+Math.cos(angles[i])*length,p[1]+Math.sin(angles[i])*length]); });
    return points;
  }
  function articulatedFinger(ctx,joints,color,width,alpha,outline) {
    // Stroke the entire joint chain as a single union. An acute folded joint must
    // not create the self-intersecting ribbon or exposed square end of a polygon.
    const commands=[["M",...joints[0]]];
    for(let i=0;i<joints.length-1;i++) {
      const a=joints[Math.max(0,i-1)],b=joints[i],c=joints[i+1],d=joints[Math.min(joints.length-1,i+2)];
      commands.push(["C",b[0]+(c[0]-a[0])/6,b[1]+(c[1]-a[1])/6,c[0]-(d[0]-b[0])/6,c[1]-(d[1]-b[1])/6,...c]);
    }
    ctx.save(); trace(ctx,commands); ctx.lineCap="round"; ctx.lineJoin="round";
    const cut=w=>{
      ctx.save(); ctx.globalAlpha=1; ctx.globalCompositeOperation="destination-out";
      ctx.strokeStyle="#000"; ctx.lineWidth=w; ctx.stroke(); ctx.restore();
    };
    cut(width+1.8);
    ctx.strokeStyle=rgba(INK,.28); ctx.lineWidth=width+1.8; ctx.stroke();
    ctx.strokeStyle=rgba(color,outline); ctx.lineWidth=width; ctx.stroke();
    cut(width-2);
    ctx.strokeStyle=rgba(color,alpha); ctx.lineWidth=width-2; ctx.stroke();
    ctx.restore();
  }
  function occlude(ctx,commands) {
    // Remove only the rear guide pixels. The video stays visible through the front hand.
    ctx.save(); ctx.globalCompositeOperation="destination-out"; ctx.globalAlpha=1;
    trace(ctx,commands); ctx.closePath(); ctx.fillStyle="#000"; ctx.fill(); ctx.restore();
  }
  function snappingHand(ctx,color,amount,reduced) {
    const v=reduced ? 0 : amount;
    const index=jointChain([-24,3],[26,20,11],[-1.95-v*.5,-1.2+v*1.4,-.6+v*1.4]);
    articulatedFinger(ctx,index,color,9.5,.1,.38);
    const middle=jointChain([-20,8],[29,22,13],[-2.02-v*.68,-1.05+v*1.45,-.6+v*1.55]);
    articulatedFinger(ctx,middle,color,11.5,.16,.75);
    const palm=[
      ["M",54,49],["C",35,48,17,46,1,44],["C",-20,43,-36,35,-38,18],
      ["C",mix(-40,-46,v),mix(8,3,v),mix(-36,-48,v),mix(-4,-12,v),mix(-25,-37,v),mix(-4,-12,v)],
      ["C",mix(-19,-29,v),mix(-3,-16,v),-15,mix(4,-9,v),-12,9],["C",-6,12,-1,6,1,0],
      ["C",3,-10,-5,-25,-8,-35],["C",-13,-46,-7,-54,-1,-48],
      ["C",4,-45,3,-35,8,-26],["C",16,-12,17,-3,27,5],
      ["C",34,13,42,14,55,16],["L",54,49],
    ];
    const angle=v*.27;
    // Only the thumb's two phalanges move; the thenar base stays attached.
    const body=palm.map((c,i)=>i>=6 && i<=9 ? c.map((n,j)=>{
      if(!j) return n;
      const x=c[j%2 ? j : j-1]-12,y=c[j%2 ? j+1 : j]-8;
      return j%2 ? 12+x*Math.cos(angle)-y*Math.sin(angle) : 8+x*Math.sin(angle)+y*Math.cos(angle);
    }) : c);
    occlude(ctx,body); shape(ctx,body,color,.17,.67);
    crease(ctx,[["M",-35,5],["C",-28,-3,-18,0,-15,6],["Q",-14,10,-20,10]],color,.4,1.15);
    crease(ctx,[["M",-34,22],["C",-29,14,-23,13,-16,19],["Q",-13,24,-21,26]],color,.32,1.1);
    crease(ctx,[["M",0,7],["C",1,19,14,28,28,26]],color,.27,1);
    crease(ctx,[["M",-9,17],["C",-7,29,0,35,10,37]],color,.18,1);
    if(v>.65) crease(ctx,[["M",-40,0],["C",-33,-6,-22,4,-20,11]],color,(v-.65)*.85,1.1);
    if(reduced || v>.08 && v<.85) {
      const path=sample(t=>cubic([-19,-30],[-36,-25],[-39,-12],[-33,0],t),28);
      ribbon(ctx,path,color,6,reduced ? .4 : .4*Math.sin(v*Math.PI),true);
      directionTip(ctx,path,color,reduced ? .55 : .5*Math.sin(v*Math.PI),5);
    }
  }
  function trace(ctx,commands,warp) {
    ctx.beginPath();
    commands.forEach(c=>{
      const values=[];
      for(let i=1;i<c.length;i+=2) { const p=warp ? warp(c[i],c[i+1]) : [c[i],c[i+1]]; values.push(p[0],p[1]); }
      if(c[0]==="M") ctx.moveTo(...values);
      else if(c[0]==="C") ctx.bezierCurveTo(...values);
      else if(c[0]==="Q") ctx.quadraticCurveTo(...values);
      else ctx.lineTo(...values);
    });
  }
  function shape(ctx,commands,color,alpha = .16,outline = .5,warp) {
    ctx.save(); trace(ctx,commands,warp); ctx.closePath();
    ctx.fillStyle=rgba(INK,.085); ctx.fill();
    const g=ctx.createLinearGradient(-38,-72,24,68);
    g.addColorStop(0,rgba(color,alpha*1.25)); g.addColorStop(.48,rgba(color,alpha*.75)); g.addColorStop(1,rgba(color,0));
    ctx.fillStyle=g; ctx.fill();
    ctx.strokeStyle=rgba(INK,.2); ctx.lineWidth=2.5; ctx.stroke();
    const edge=ctx.createLinearGradient(-36,-64,22,67);
    edge.addColorStop(0,rgba(color,outline)); edge.addColorStop(.65,rgba(color,outline*.65)); edge.addColorStop(1,rgba(color,0));
    ctx.strokeStyle=edge; ctx.lineWidth=1.25; ctx.stroke(); ctx.restore();
  }
  function crease(ctx,commands,color=WHITE,alpha=.28,width=1.1,warp) {
    ctx.save(); trace(ctx,commands,warp);
    if(color!==INK) { ctx.strokeStyle=rgba(INK,alpha*.65); ctx.lineWidth=width+1.4; ctx.stroke(); }
    ctx.strokeStyle=rgba(color,alpha); ctx.lineWidth=width; ctx.stroke(); ctx.restore();
  }
  function hand(ctx,x,y,target,color,amount,height,angle = 0,reduced = false) {
    const snap=target==="hand_finger_snap",gun=target==="hand_finger_gun_recoil";
    const pose=target==="hand_thumb_down" ? "hand_thumb_up" : target;
    const commands=HAND_CONTOURS[pose] || HAND_CONTOURS.hand_open_palm;
    // Small joint relaxation keeps the pose legible, with the palm/wrist anchored.
    const relax=snap || gun ? 0 : (1-amount)*.085;
    const warp=(px,py)=>[px+Math.max(0,-py-16)*relax*.12,py+Math.max(0,-py-8)*relax];
    ctx.save(); ctx.translate(x,y); ctx.scale(height/144,height/144); ctx.rotate(angle);
    if(target==="hand_thumb_down") ctx.rotate(Math.PI);
    if(gun) ctx.rotate(Math.PI*.5);
    if(snap) { snappingHand(ctx,color,reduced ? 0 : amount,reduced); ctx.restore(); return; }
    shape(ctx,commands,color,.2,.62,warp);
    if(!["hand_closed_fist","hand_thumb_up","hand_thumb_down"].includes(target))
      crease(ctx,[["M",-15,20],["C",-5,12,7,15,19,9]],color,.24,1,warp);
    crease(ctx,[["M",-22,12],["C",-16,17,-14,29,-16,38]],color,.19,1,warp);
    if(!["hand_open_palm","hand_i_love_you","hand_thumb_up","hand_thumb_down"].includes(target) && !snap && !gun)
      crease(ctx,[["M",-26,3],["C",-18,-4,-7,0,-2,7]],color,.4,1.2);
    const folded=target==="hand_closed_fist" ? [-9,3,16] : target==="hand_thumb_up" || target==="hand_thumb_down" ? [] : ["hand_pointing_up","hand_finger_gun_recoil"].includes(target) ? [5,17,27] : target==="hand_victory" || target==="hand_i_love_you" ? [12,24] : snap ? [20,29] : [];
    folded.forEach((xx,i)=>crease(ctx,[["M",xx-5,-10+i*4],["C",xx-1,-13+i*4,xx+5,-9+i*4,xx+4,-3+i*4]],color,.25,1,warp));
    if(pose==="hand_thumb_up") [-2,12,25].forEach((yy,i)=>crease(ctx,[["M",26-i*2,yy],["C",16,yy+1,6,yy-2,5,yy-6]],color,.29,1));
    if(target==="hand_open_palm") [-20,-3,20,35].forEach((xx,i)=>crease(ctx,[["M",xx-2.5,-27+i*3],["Q",xx,-25+i*3,xx+2.5,-26+i*3]],color,.17,.85,warp));
    ctx.restore();
  }

  function face(ctx,x,y,target,color,v,height) {
    ctx.save(); ctx.translate(x,y); ctx.scale(height/168,height/168);
    const puff=target==="face_cheek_puff" ? v*6 : 0,jaw=target==="face_mouth_open" ? v*4 : 0;
    // Broadest at the cheekbones, with a soft taper into the jaw and a rounded chin.
    shape(ctx,[["M",0,-71],["C",-25,-71,-42,-55,-44,-32],
      ["C",-46,-19,-49,-9,-48,4],["C",-48-puff,22,-36,39,-24,49+jaw],
      ["C",-14,57+jaw,-9,62+jaw,0,62+jaw],["C",9,62+jaw,14,57+jaw,24,49+jaw],
      ["C",36,39,48+puff,22,48,4],["C",49,-9,46,-19,44,-32],
      ["C",42,-55,25,-71,0,-71]],WHITE,.085,.44);
    // A single fine eyelid curve carries the action; neutral details remain quieter.
    [-1,1].forEach((side,i)=>{
      const active=target===(i===0 ? "face_wink_left" : "face_wink_right") || target==="face_blink";
      const close=active ? v : target==="face_smile" ? v*.22 : target==="face_brow_furrow" ? v*.12 : 0;
      const xx=side*21,yy=-12+close*.7,open=1-close,eyeColor=active ? color : WHITE;
      crease(ctx,[["M",xx-10,yy],["C",xx-4,yy-5*open+2.8*close,xx+4,yy-5*open+2.8*close,xx+10,yy]],eyeColor,active ? .92 : .56,active ? 1.7 : 1.15);
      if(open>.06) {
        crease(ctx,[["M",xx-10,yy],["C",xx-4,yy+3*open,xx+4,yy+3*open,xx+10,yy]],eyeColor,.24*open,.9);
        ellipse(ctx,xx,yy-.4,2.2,2.7*open,eyeColor,.53*open);
      }
      const raise=target==="face_brow_raise" ? v*8 : 0,furrow=target==="face_brow_furrow" ? v : 0,brow=/brow/.test(target);
      crease(ctx,[["M",xx-side*10,-26-raise+furrow*8],
        ["C",xx-side*4,-30-raise+furrow*6,xx+side*4,-31-raise,xx+side*11,-26-raise]],brow ? color : WHITE,brow ? .87 : .39,brow ? 1.8 : 1.35);
    });
    crease(ctx,[["M",-1,-4],["C",-1,1,-4,7,-3,10],["Q",0,12,3,10]],WHITE,.25,1);
    const smile=target==="face_smile" ? v : 0,pucker=target==="face_mouth_pucker" ? v : 0,opened=target==="face_mouth_open" ? v : 0;
    const active=/smile|mouth/.test(target),mc=active ? color : WHITE,w=15+smile*5-pucker*8-opened*3;
    const base=29,corner=base-smile*4,top=base-2-pucker*4-opened*12,bottom=base+2+smile*7+pucker*5+opened*16;
    // Open mouth is an oval, pucker is a small rounded aperture, smile lifts both corners.
    ctx.save(); ctx.beginPath(); ctx.moveTo(-w,corner);
    ctx.bezierCurveTo(-w*.63,top,w*.63,top,w,corner);
    ctx.bezierCurveTo(w*.7,bottom,-w*.7,bottom,-w,corner);
    ctx.fillStyle=rgba(INK,active ? .14 : .04); ctx.fill();
    ctx.strokeStyle=rgba(INK,active ? .48 : .2); ctx.lineWidth=active ? 2.9 : 2.4; ctx.stroke();
    ctx.strokeStyle=rgba(mc,active ? .84 : .39); ctx.lineWidth=active ? 1.5 : 1.05; ctx.stroke();
    if(opened<.15 && pucker<.3) crease(ctx,[["M",-w,corner],["C",-w*.4,base+smile*2,w*.4,base+smile*2,w,corner]],mc,.25,.8);
    if(smile>0) [-1,1].forEach(side=>crease(ctx,[["M",side*24,21],["Q",side*27,24,side*26,28]],mc,smile*.2,.9));
    ctx.restore();
    if(puff>0) [-1,1].forEach(side=>{
      const g=ctx.createRadialGradient(side*34,17,1,side*34,17,19+puff);
      g.addColorStop(0,rgba(color,v*.11)); g.addColorStop(1,rgba(color,0));
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(side*34,17,19+puff,19,0,0,TAU); ctx.fill();
      crease(ctx,[["M",side*37,3],["C",side*(46+puff),11,side*(45+puff),26,side*34,33]],color,v*.58,1.3);
    });
    ctx.restore();
  }

  function blowingProfile(ctx,x,y,color,scale) {
    ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
    // Brow → nasal bridge → nose tip → philtrum → pursed lips → chin → neck.
    const outline=[["M",-17,-59],["C",-3,-57,2,-47,1,-38],
      ["C",0,-33,-2,-29,0,-25],["C",3,-19,9,-15,10,-11],
      ["Q",10,-8,4,-8],["Q",1,-8,1,-5],
      ["C",2,-3,5,-3,8,-2],["Q",11,-1,8,0],
      ["C",6,1,4,1,3,2],["C",5,3,9,3,8,5],
      ["Q",7,7,2,7],["C",-1,8,2,13,0,17],
      ["C",-2,23,-9,23,-15,21],["C",-22,28,-22,34,-19,41]];
    trace(ctx,outline); ctx.lineTo(-35,41); ctx.lineTo(-39,-47); ctx.closePath();
    const fill=ctx.createLinearGradient(-35,0,10,0); fill.addColorStop(0,rgba(color,0)); fill.addColorStop(1,rgba(color,.105));
    ctx.fillStyle=fill; ctx.fill();
    crease(ctx,outline,INK,.28,3); crease(ctx,outline,color,.63,1.3);
    crease(ctx,[["M",-12,-27],["Q",-7,-24,-2,-26]],color,.39,1.05);
    crease(ctx,[["M",-14,-34],["Q",-8,-37,-3,-33]],color,.28,1.1);
    crease(ctx,[["M",3,1],["Q",5,0,9,1]],color,.8,1);
    crease(ctx,[["M",-25,-7],["C",-24,3,-19,8,-13,10]],color,.15,.9);
    ctx.restore();
  }

  function clapContour(rear) {
    return [["M",-12,63],["C",-13,47,-25,31,-27,14],
      ["C",-30,4,-36,-12,-34,-24],["C",-33,-32,-27,-34,-25,-25],
      ["C",-24,-18,-21,-10,-17,-8],["C",-16,-19,-18,-39,-16,-50],
      ["C",-15,-58,-8,-59,-7,-51],["L",-5,-45],
      ["C",-5,-43,-7,-59,-4,-65],["C",-1,-72,6,-70,6,-62],["L",6,-45],
      ["C",8,-40,7,-53,10,-58],["C",13,-64,19,-61,18,-54],["L",16,-38],
      ["C",19,-33,20,-43,23,-46],["C",27,-51,32,-47,30,-40],
      ["C",27,-26,25,-10,25,4],["C",25,23,17,35,12,43],
      ["C",9,50,10,57,11,63],["C",4,65,-5,65,-12,63]]
      .map(c=>c.map((v,i)=>i && i%2 ? v*(rear ? .86 : 1) : v));
  }
  function clappingHands(ctx,x,y,color,height,amount,phase,reduced) {
    ctx.save(); ctx.translate(x,y); ctx.scale(height/144,height/144);
    const v=reduced ? .8 : amount;
    const distance=mix(29,3,v),theta=.65;
    const near={ x:Math.cos(theta)*distance,y:Math.sin(theta)*distance+3,angle:.74-v*.07 };
    const far={ x:-Math.cos(theta)*distance,y:-Math.sin(theta)*distance-3,angle:.57+v*.06 };
    const transform=(commands,p)=>commands.map(c=>c.map((n,i)=>{
      if(!i) return n;
      const xx=c[i%2 ? i : i-1],yy=c[i%2 ? i+1 : i];
      return i%2 ? p.x+xx*Math.cos(p.angle)-yy*Math.sin(p.angle) : p.y+xx*Math.sin(p.angle)+yy*Math.cos(p.angle);
    }));
    const rear=transform(clapContour(true),far),front=transform(clapContour(false),near);
    shape(ctx,rear,color,.11,.43);
    // At contact the nearer hand occludes the far hand, preserving its volume.
    occlude(ctx,front); shape(ctx,front,color,.19,.7);
    ctx.save(); ctx.translate(near.x,near.y); ctx.rotate(near.angle);
    crease(ctx,[["M",-18,-7],["C",-15,4,-19,15,-15,26]],color,.22,1);
    [[-6,-31,-6,0],[6,-31,4,-1],[16,-25,12,3]].forEach(p=>crease(ctx,[["M",p[0],p[1]],["Q",p[0]+2,(p[1]+p[3])/2,p[2],p[3]]],color,.27,1));
    crease(ctx,[["M",-5,6],["C",1,18,4,29,4,37]],color,.13,.9);
    ctx.restore();
    const impact=reduced ? .45 : phase>.35 && phase<.47 ? Math.sin((phase-.35)/.12*Math.PI)*.65 : 0;
    if(impact>0) {
      crease(ctx,[["M",49,-44],["Q",53,-48,54,-52]],color,impact,1.5);
      crease(ctx,[["M",59,-35],["Q",65,-36,69,-39]],color,impact*.8,1.3);
    }
    if(v<.2 || reduced) {
      const alpha=reduced ? .4 : (.2-v)*1.7;
      [-1,1].forEach(side=>{
        const path=sample(t=>[side*(39-t*15)*Math.cos(theta),side*(39-t*15)*Math.sin(theta)],18);
        ribbon(ctx,path,color,8,alpha,true); directionTip(ctx,path,color,alpha,5);
      });
    }
    ctx.restore();
  }

  function phone(ctx,x,y,angle,color,height,reference = false) {
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle); ctx.scale(height/120,height/120);
    rounded(ctx,-31,-60,62,120,10);
    if(!reference) { ctx.fillStyle=rgba(INK,.12); ctx.fill(); ctx.strokeStyle=rgba(INK,.25); ctx.lineWidth=3; ctx.stroke(); }
    ctx.fillStyle=rgba(color,reference ? 0 : .11); ctx.fill(); ctx.strokeStyle=rgba(color,reference ? .12 : .53); ctx.lineWidth=1.4; ctx.stroke();
    if(!reference) {
      const g=ctx.createLinearGradient(-25,-50,25,45); g.addColorStop(0,rgba(color,.03)); g.addColorStop(1,rgba(color,.07));
      rounded(ctx,-25,-49,50,95,5); ctx.fillStyle=g; ctx.fill(); stroke(ctx,[[-9,52],[9,52]],color,.55,2);
      ellipse(ctx,0,-54,2,2,color,.5);
    }
    ctx.restore();
  }
  function pitchedPhone(ctx,x,y,color,height,pitch) {
    const amount=clamp(Math.abs(pitch),0,.85),signed=clamp(pitch,-.85,.85);
    const topHalf=31*(1+signed*.16),bottomHalf=31*(1-signed*.16);
    const top=-60+amount*8,bottom=60-amount*8,corner=8;
    ctx.save(); ctx.translate(x,y); ctx.scale(height/120,height/120);
    ctx.beginPath();
    ctx.moveTo(-topHalf+corner,top); ctx.lineTo(topHalf-corner,top);
    ctx.quadraticCurveTo(topHalf,top,topHalf,top+corner);
    ctx.lineTo(bottomHalf,bottom-corner); ctx.quadraticCurveTo(bottomHalf,bottom,bottomHalf-corner,bottom);
    ctx.lineTo(-bottomHalf+corner,bottom); ctx.quadraticCurveTo(-bottomHalf,bottom,-bottomHalf,bottom-corner);
    ctx.lineTo(-topHalf,top+corner); ctx.quadraticCurveTo(-topHalf,top,-topHalf+corner,top); ctx.closePath();
    ctx.fillStyle=rgba(INK,.12); ctx.fill(); ctx.strokeStyle=rgba(color,.53); ctx.lineWidth=1.4; ctx.stroke();
    const innerTopHalf=topHalf*.8,innerBottomHalf=bottomHalf*.8,innerTop=top+11,innerBottom=bottom-14;
    ctx.beginPath(); ctx.moveTo(-innerTopHalf,innerTop); ctx.lineTo(innerTopHalf,innerTop);
    ctx.lineTo(innerBottomHalf,innerBottom); ctx.lineTo(-innerBottomHalf,innerBottom); ctx.closePath();
    const g=ctx.createLinearGradient(0,innerTop,0,innerBottom); g.addColorStop(0,rgba(color,.03)); g.addColorStop(1,rgba(color,.08));
    ctx.fillStyle=g; ctx.fill(); stroke(ctx,[[-8,bottom-7],[8,bottom-7]],color,.55,2);
    ellipse(ctx,0,top+6,2,2,color,.5); ctx.restore();
  }
  function microphone(ctx,x,y,color,height = 43) {
    ctx.save(); ctx.translate(x,y); ctx.scale(height/43,height/43);
    rounded(ctx,-7,-21,14,27,7); ctx.fillStyle=rgba(color,.16); ctx.fill(); ctx.strokeStyle=rgba(color,.65); ctx.lineWidth=1.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12,0); ctx.bezierCurveTo(-12,19,12,19,12,0); ctx.stroke(); stroke(ctx,[[0,14],[0,22],[-7,22],[7,22]],color,.55); ctx.restore();
  }

  function paint(ctx,model,layout,snapshot,seconds,reduced) {
    if(!shouldDisplay(model,snapshot)) return;
    const { x,y,size,length }=layout;
    // A held but idle swipe must teach movement again instead of freezing its old trace.
    const points=model.kind==="flow" && snapshot.continuousPhase==="resume_leg" && !snapshot.driving ? [] : snapshot.points || [],pressed=points.length>0;
    const actual = model.sustained ? snapshot.hasInput && snapshot.driving : pressed || model.sensor && snapshot.hasInput || model.kind==="tap" && snapshot.count>0;
    const color=actual ? GREEN : WHITE,frame=actionFrame(model,seconds,reduced),ratio=clamp(snapshot.progress);
    const last=pressed ? points[0] : actual && !model.sensor && snapshot.lastPoint;
    const px=last ? last.x : x,py=last ? last.y : y;
    ctx.save(); ctx.lineCap="round"; ctx.lineJoin="round";
    // Keep teaching geometry inside the host safe area; real touches retain their true coordinates.
    if(!pressed && !actual) { ctx.beginPath(); ctx.rect(layout.left,layout.top,layout.width,layout.height); ctx.clip(); }
    ctx.globalAlpha*=actual || reduced ? 1 : mix(.48,1,ease(seconds/.12));
    if(model.kind==="tap") {
      contact(ctx,px,py,color,1,actual);
      const interval=model.sustained ? .35 : model.count===3 ? .15 : .23;
      if(!reduced) {
        const time=seconds % model.period;
        for(let i=0;i<(model.sustained ? 1 : model.count);i++) {
          const dt=time-(model.sustained ? 0 : .12+i*interval);
          if(dt>=0 && dt<.45) { ring(ctx,px,py,12+ease(dt/.45)*34,color,(1-dt/.45)*.5,0,TAU,3*(1-dt/.45)+.5); }
        }
      }
      if(!model.sustained) for(let i=0;i<model.count;i++) {
        const n=actual ? snapshot.count : reduced ? model.count : Math.max(0,Math.floor((frame.phase*model.period-.12)/interval)+1);
        ellipse(ctx,px+(i-(model.count-1)*.5)*14,py-32,3,3,i<n && actual ? GREEN : WHITE,i<n ? .9 : .24);
      }
    } else if(model.kind==="hold" || model.kind==="charge") {
      contact(ctx,px,py,color,pressed ? .9 : 1,true);
      progress(ctx,px,py,32,pressed ? ratio : 0);
      if(!pressed) ring(ctx,px,py,32,WHITE,.55,-Math.PI/2,-Math.PI/2+Math.max(.04,frame.amount)*TAU,3);
      if(model.kind==="charge") for(let k=0;k<3;k++) {
        const q=reduced ? .55 : (seconds*.75+k/3)%1,a=k*TAU/3;
        ribbon(ctx,sample(t=>[px+Math.cos(a+.22*(1-t))*(63-(q+t*.22)*35),py+Math.sin(a+.22*(1-t))*(63-(q+t*.22)*35)],12),color,10,Math.sin(q*Math.PI)*.75,true);
      }
    } else if(["swipe","drag","scrub","flow"].includes(model.kind)) {
      const path=layout.paths.main;
      if(pressed) {
        const origin=snapshot.origin || points[0],trace=(snapshot.path || []).map(p=>[p.x,p.y]);
        if(model.kind==="drag") {
          const link=sample(t=>cubic([origin.x,origin.y],[mix(origin.x,px,.35),origin.y+7],[mix(origin.x,px,.75),py+7],[px,py],t));
          ribbon(ctx,link,color,18,.9,true); contact(ctx,origin.x,origin.y,WHITE,.7,false);
          ctx.save(); rounded(ctx,px-14,py-14,28,28,9); ctx.fillStyle=rgba(color,.19); ctx.fill(); ctx.strokeStyle=rgba(color,.75); ctx.stroke(); ctx.restore();
        } else if(trace.length>1) ribbon(ctx,trace,color,model.kind==="flow" ? 22 : 17,.95,true);
        if(model.kind==="flow" && snapshot.continuousPhase==="return_leg") {
          const back=trace.length>1 ? [trace[trace.length-1],[origin.x,origin.y]] : path.slice().reverse();
          ribbon(ctx,back,WHITE,20,.4,true); directionTip(ctx,back,WHITE,.65);
        } else if(model.kind!=="flow") {
          const target=[clamp(origin.x+model.dx*length*.6,layout.left+16,layout.left+layout.width-16),clamp(origin.y+model.dy*length*.6,layout.top+16,layout.top+layout.height-16)];
          directionTip(ctx,[[px,py],target],WHITE,.6);
        }
        contact(ctx,px,py,color,1,true);
      } else {
        const reverse=frame.direction<0;
        if(frame.release) ctx.globalAlpha*=1-ease((frame.phase-(model.kind==="swipe" ? .65 : .88))/(model.kind==="swipe" ? .35 : .12));
        flowPath(ctx,path,reverse ? 1-frame.amount : frame.amount,color,model.kind==="swipe" ? 25 : 20,reverse,reduced,true);
        if((model.kind==="scrub" || model.kind==="flow") && !reverse) directionTip(ctx,path.slice().reverse(),color,.24,8);
        const p=pointAt(path,frame.amount);
        if(model.kind==="drag" && !frame.release) {
          const a=path[0],link=sample(t=>cubic(a,[mix(a[0],p[0],.3),mix(a[1],p[1],.3)+6],[mix(a[0],p[0],.75),mix(a[1],p[1],.75)+6],p,t));
          ribbon(ctx,link,WHITE,15,.65,true); contact(ctx,a[0],a[1],WHITE,.7);
          rounded(ctx,p[0]-14,p[1]-14,28,28,9); ctx.fillStyle=rgba(WHITE,.16); ctx.fill(); ctx.strokeStyle=rgba(WHITE,.7); ctx.stroke();
        }
        if(!frame.release || reduced) contact(ctx,p[0],p[1],color,1,model.kind==="drag");
        if(model.kind==="scrub") {
          const end=path[path.length-1]; ring(ctx,end[0],end[1],17,WHITE,.45,0,TAU,2);
          if(frame.phase>.82 || reduced) ring(ctx,end[0],end[1],20+(frame.phase-.82)*32,WHITE,reduced ? .4 : .5,0,TAU,1);
        }
      }
    } else if(model.kind==="circle") {
      if(pressed && snapshot.path && snapshot.path.length) { ribbon(ctx,snapshot.path.map(p=>[p.x,p.y]),GREEN,22,.95,true); contact(ctx,px,py,GREEN,1,true); }
      else {
        // Open guide arc: recognition accepts either direction and does not require a perfect closed circle.
        const phase=seconds/model.period%1,path=layout.paths.circle,head=phase+.045*Math.sin(phase*TAU),width=Math.min(28,size*.12);
        ribbon(ctx,path,WHITE,width,.2,false);
        const segment=reduced ? pathPart(path,.32,.86) : sample(t=>pointAt(layout.paths.loop,(head-.46+t*.46+1)%1),48);
        ribbon(ctx,segment,WHITE,width,1,true); directionTip(ctx,pathPart(segment,0,.83),WHITE,.8,9);
        const p=reduced ? pointAt(path,.86) : pointAt(layout.paths.loop,head); contact(ctx,p[0],p[1],WHITE,.9);

      }
    } else if(model.kind==="pinch") {
      if(points.length===2) { ribbon(ctx,[[points[0].x,points[0].y],[points[1].x,points[1].y]],GREEN,14,.6,false); points.forEach(p=>contact(ctx,p.x,p.y,GREEN,1,true)); }
      else {
        if(frame.release && !reduced) ctx.globalAlpha*=1-ease((frame.phase-.8)/.2);
        [-1,1].forEach(s=>{
        const from=size*(model.outward ? .14 : .46),to=size*(model.outward ? .46 : .14);
        const path=sample(t=>[x+s*mix(from,to,t),y+Math.sin(t*Math.PI)*s*9],32);
        flowPath(ctx,path,frame.amount,WHITE,22,false,reduced,true);
        const p=pointAt(path,frame.amount); contact(ctx,p[0],p[1],WHITE,1);
      });
      }
    } else if(model.kind==="erase") {
      const q=actual ? ratio : reduced ? .65 : frame.amount;
      // A soft field clears behind the moving brush; no stacked rectangular stripes.
      ctx.save(); ctx.translate(x,y); ctx.scale(1,.72);
      const field=ctx.createRadialGradient(0,0,1,0,0,size*.5);
      field.addColorStop(0,rgba(WHITE,.1*(1-q))); field.addColorStop(1,rgba(WHITE,0));
      ctx.fillStyle=field; ctx.beginPath(); ctx.arc(0,0,size*.5,0,TAU); ctx.fill(); ctx.restore();
      if(pressed) { ribbon(ctx,(snapshot.path || []).map(p=>[p.x,p.y]),GREEN,25,.8,true); contact(ctx,px,py,GREEN,1.5,true); }
      else {
        const to=reduced ? .7 : frame.amount,p=pointAt(layout.paths.erase,to),trail=pathPart(layout.paths.erase,Math.max(0,to-.28),to);
        ribbon(ctx,trail,WHITE,25,.85,true);
        if(to>.12) directionTip(ctx,pathPart(trail,0,.76),WHITE,.7,8);
        contact(ctx,p[0],p[1],WHITE,1.35);
      }
    } else if(["still","tilt","pitch","shake","rotate"].includes(model.kind)) {
      const h=layout.phoneSize;
      let angle=0,tx=x;
      if(model.kind==="tilt") angle=model.sign*.35*(actual ? ratio : frame.amount);
      if(model.kind==="rotate") angle=model.sign*Math.PI*.62*(actual ? ratio : frame.amount);
      if(model.kind==="shake") tx+=reduced ? h*.12 : Math.sin(seconds*TAU/model.period)*h*.18;
      phone(ctx,x,y,0,WHITE,h,true);
      ctx.save();
      if(model.kind==="rotate" && !actual && !reduced) ctx.globalAlpha*=mix(.18,1,ease(frame.phase/.1))*(frame.release ? 1-ease((frame.phase-.83)/.17) : 1);
      if(model.kind==="pitch") pitchedPhone(ctx,tx,y,color,h,model.sign*.72*(actual ? ratio : frame.amount));
      else phone(ctx,tx,y,angle,color,h);
      ctx.restore();
      if(model.kind==="rotate") flowPath(ctx,layout.paths.orbit,frame.amount,WHITE,18,false,reduced);
      if(model.kind==="tilt") {
        const path=sample(t=>[x+model.sign*(h*.38+t*h*.28),y+h*.48-Math.sin(t*Math.PI*.5)*h*.32],32);
        flowPath(ctx,path,frame.amount,WHITE,17,false,reduced);
      }
      if(model.kind==="pitch") {
        const path=sample(t=>[x+h*.48+Math.sin(t*Math.PI)*h*.08,y+model.sign*(h*.32-t*h*.64)],32);
        flowPath(ctx,path,frame.amount,WHITE,17,false,reduced);
      }
      if(model.kind==="shake") [-1,1].forEach(s=>flowPath(ctx,sample(t=>[x+s*(h*.34+t*h*.27),y+Math.sin(t*Math.PI)*6],24),frame.amount,WHITE,16,false,reduced));
      if(model.kind==="still") {
        const a=h*.64; stroke(ctx,[[x-a,y-h*.45],[x-a,y+h*.45]],WHITE,.24,2); stroke(ctx,[[x+a,y-h*.45],[x+a,y+h*.45]],WHITE,.24,2);
        if(actual) progress(ctx,x,y,h*.72,ratio);
      }
    } else if(model.kind==="face") {
      face(ctx,x,y,model.target,color,actual || reduced ? 1 : frame.amount,layout.faceSize);
    } else if(model.kind==="hand") {
      const gun=model.target==="hand_finger_gun_recoil",v=!model.sustained && (actual || reduced) ? 1 : frame.amount;
      const lift=gun ? v*layout.handSize*.11 : 0;
      hand(ctx,x,y-lift,model.target,color,reduced && gun ? 0 : v,layout.handSize,gun ? -v*.16 : 0,reduced);
      if(gun) {
        const path=sample(t=>[x+layout.handSize*.43+t*layout.handSize*.14,y-layout.handSize*.05-t*layout.handSize*.22],24);
        flowPath(ctx,path,v,WHITE,12,false,reduced);
      }
    } else if(model.kind==="voice" || model.kind==="quiet") {
      const span=Math.min(layout.width*.67,230),mx=x-span*.5-21;
      microphone(ctx,mx,y,color);
      if(model.sustained && snapshot.meter) {
        const m=snapshot.meter,scale=.75,min=clamp(m.minimum,0,100),max=clamp(m.maximum,min,100),start=x-span*.36;
        ctx.fillStyle=rgba(WHITE,.055); rounded(ctx,start,y+38-max*scale,span*.85,(max-min)*scale,5); ctx.fill();
        const history=m.history || [];
        // Warm-white reference wave teaches steady input; only actual driving uses measured feedback.
        const wave=actual ? history.map((v,i)=>[start+i/Math.max(1,history.length-1)*span*.85,y+38-clamp(v,0,100)*scale])
          : sample(t=>[start+t*span*.85,y+38-(min+max)*.5*scale+Math.sin(t*Math.PI*8-(reduced ? 0 : seconds*5))*Math.min(3,(max-min)*scale*.18)],64);
        stroke(ctx,wave,color,.85,2.4);
        if(actual) ellipse(ctx,start+span*.85,y+38-clamp(m.score,0,100)*scale,4,4,GREEN,1);
      } else {
        const envelope=model.sustained || reduced ? 1 : Math.sin(clamp(frame.phase/.7)*Math.PI);
        const amp=model.kind==="quiet" ? 1 : actual ? clamp(snapshot.level)*25 : (11+Math.sin(seconds*3)*5)*envelope;
        const path=sample(t=>[x-span*.34+t*span*.85,y+Math.sin(t*Math.PI*7-(reduced ? 0 : seconds*6))*amp*Math.sin(t*Math.PI)],80);
        ribbon(ctx,path,color,model.kind==="quiet" ? 7 : 12,.75,false); stroke(ctx,path,color,.7,1.7);
        if(actual && model.kind==="quiet") progress(ctx,mx,y,29,ratio);
        if(model.sustained && !snapshot.meter) { ctx.fillStyle=rgba(WHITE,.04); rounded(ctx,x-span*.34,y-12,span*.85,24,8); ctx.fill(); }
      }
    } else if(model.kind==="blow") {
      const span=Math.min(layout.width*.72,226),sx=x-span*.5+24,profileScale=Math.min(1,layout.height/230);
      blowingProfile(ctx,sx,y,color,profileScale);
      const mouth=sx+11*profileScale,end=x+span*.5-19;
      for(let k=0;k<3;k++) {
        const path=sample(t=>[mouth+t*(end-mouth),y+1+(k-1)*(2+t*12)+Math.sin(t*Math.PI)*2],40);
        const head=reduced ? .8 : model.sustained ? (seconds*1.65+k*.12)%1 : clamp((frame.phase-.12)/.55-k*.07);
        ctx.save();
        if(!model.sustained && !reduced && !actual) ctx.globalAlpha*=.25+.75*Math.sin(clamp((frame.phase-.12)/.65)*Math.PI);
        ribbon(ctx,path,color,7,.18,false);
        const segment=pathPart(path,Math.max(0,head-.55),Math.max(.02,head));
        ribbon(ctx,segment,color,8,.8,true);
        if(k===1) directionTip(ctx,segment,color,.65,6);
        ctx.restore();
      }
      microphone(ctx,x+span*.5,y,WHITE,37);
      if(model.sustained && snapshot.meter) {
        const m=snapshot.meter,start=sx+16,w=span-42; ctx.fillStyle=rgba(WHITE,.1); ctx.fillRect(start,y+30,w,4);
        ctx.fillStyle=rgba(WHITE,.28); ctx.fillRect(start+clamp(m.minimum,0,100)/100*w,y+30,(clamp(m.maximum,0,100)-clamp(m.minimum,0,100))/100*w,4);
        if(actual) ellipse(ctx,start+clamp(m.score,0,100)/100*w,y+32,3.5,3.5,GREEN,1);
      }
    } else if(model.kind==="clap") {
      clappingHands(ctx,x,y,color,Math.min(layout.handSize,144),frame.amount,frame.phase,reduced);
    } else ring(ctx,x,y,14,WHITE);
    ctx.restore();
    const info=information(model,snapshot);
    if(info.timeLine) { const p=captionPlacement(model,layout,snapshot,null,info.copy); ctx.fillStyle=rgba(WHITE,.7); ctx.fillRect(p.x-24,p.y+28,48*clamp(snapshot.remainingMs/snapshot.durationMs),2); }
  }

  function create(document,window,parent,caption) {
    const surface=document.createElement("section"); surface.className="spatial-guidance"; surface.hidden=true;
    const canvas=document.createElement("canvas"); canvas.className="spatial-guidance-canvas"; canvas.setAttribute("aria-hidden","true");
    surface.appendChild(canvas); surface.appendChild(caption); parent.appendChild(surface);
    const preference=window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches:false };
    let ctx=null; try { ctx=canvas.getContext && canvas.getContext("2d"); } catch(_) { /* Text remains usable. */ }
    let model=null,layout=null,bounds=null,startedAt=0,failed=!ctx,lastCopy="",insets=null,hostVisible=true,lastSnapshot=null;
    const cueTitle=caption.querySelector && caption.querySelector("[data-motion-title]") || document.getElementById("cue-title");
    const cueInstruction=caption.querySelector && caption.querySelector("[data-motion-instruction]") || document.getElementById("cue-instruction");
    function resize(nextInsets) {
      if(nextInsets!==undefined) insets=nextInsets;
      const rect=parent.getBoundingClientRect ? parent.getBoundingClientRect() : null;
      bounds={ left:rect ? rect.left : 0,top:rect ? rect.top : 0,width:rect && rect.width || window.innerWidth || 360,height:rect && rect.height || window.innerHeight || 640 };
      const density=Math.min(window.devicePixelRatio || 1,1.5); canvas.width=Math.round(bounds.width*density); canvas.height=Math.round(bounds.height*density);
      if(ctx) ctx.setTransform(density,0,0,density,0,0);
      if(model) layout=planLayout(bounds.width,bounds.height,insets,model);
      surface.dataset.rendering=failed ? "text" : "canvas";
    }
    function show(cue,safeInsets,now) {
      model=resolve(cue); lastCopy=""; lastSnapshot=null; startedAt=now; surface.hidden=!hostVisible; caption.hidden=!hostVisible;
      surface.dataset.kind=model.kind; surface.dataset.variant=model.id;
      cueInstruction.textContent=model.description;
      resize(safeInsets); render({ points:[],path:[],progress:0,count:0,remainingMs:null,durationMs:0 },now);
    }
    function render(snapshot,now) {
      if(!model || !layout) return;
      const wasHidden=surface.hidden;
      lastSnapshot=snapshot;
      const display=hostVisible && shouldDisplay(model,snapshot);
      surface.hidden=!display; caption.hidden=!display;
      surface.dataset.visibility=!hostVisible ? "inactive" : display ? "guiding" : "driving";
      if(!display) { if(ctx && !wasHidden) ctx.clearRect(0,0,canvas.width,canvas.height); return; }
      // Restart a complete demonstration when sustained input stops, not at an arbitrary old phase.
      if(wasHidden && model.sustained) startedAt=now;
      const info=information(model,snapshot); if(lastCopy!==info.copy) { cueTitle.textContent=info.copy; lastCopy=info.copy; }
      caption.dataset.urgent=String(info.urgent); caption.dataset.driving=String(model.sustained && !!snapshot.driving);
      const placement=captionPlacement(model,layout,snapshot,bounds,info.copy);
      caption.style.left=`${placement.x}px`; caption.style.top=`${placement.y}px`; caption.style.maxWidth=`${Math.max(100,layout.width-12)}px`;
      if(!ctx || failed) return;
      try {
        ctx.clearRect(0,0,bounds.width,bounds.height);
        const translate=p=>({ x:p.x-bounds.left,y:p.y-bounds.top });
        const data=Object.assign({},snapshot,{ points:(snapshot.points || []).map(translate),path:(snapshot.path || []).map(translate),origin:snapshot.origin ? translate(snapshot.origin) : null,lastPoint:snapshot.lastPoint ? translate(snapshot.lastPoint) : null });
        ctx.shadowColor="rgba(10,16,8,.7)"; ctx.shadowBlur=1; ctx.shadowOffsetY=1;
        if(!snapshot.preparing && !snapshot.blocked && !snapshot.retryReady) paint(ctx,model,layout,data,Math.max(0,now-startedAt)/1000,preference.matches || snapshot.reducedMotion===true);
      } catch(_) { failed=true; try { ctx.clearRect(0,0,bounds.width,bounds.height); } catch(_) {} surface.dataset.rendering="text"; }
    }
    function hide() { surface.hidden=true; caption.hidden=true; model=null; layout=null; lastSnapshot=null; if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height); }
    // Atlas/mock input stays in surface coordinates even when the document is scrolled.
    function renderLocal(snapshot,now) {
      if(!bounds) return;
      const global=p=>({ x:p.x+bounds.left,y:p.y+bounds.top });
      render(Object.assign({},snapshot,{ points:(snapshot.points || []).map(global),path:(snapshot.path || []).map(global),
        origin:snapshot.origin ? global(snapshot.origin) : null,lastPoint:snapshot.lastPoint ? global(snapshot.lastPoint) : null }),now);
    }
    function setVisible(visible) { hostVisible=!!visible; const display=hostVisible && !!model && (!lastSnapshot || shouldDisplay(model,lastSnapshot)); surface.hidden=!display; caption.hidden=!display; }
    function destroy() { hide(); parent.appendChild(caption); if(surface.parentNode) surface.parentNode.removeChild(surface); }
    return { show,render,renderLocal,resize,hide,setVisible,destroy,getModel:()=>model,getPlacement:()=>layout ? { x:parseFloat(caption.style.left),y:parseFloat(caption.style.top) } : null };
  }
  return Object.freeze({ resolve,planLayout,information,shouldDisplay,captionPlacement,actionFrame,create,paint,targets:Object.freeze(Object.assign({},HANDS,FACES)) });
});
