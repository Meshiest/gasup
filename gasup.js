const $ = document.querySelector.bind(document);
const $all = document.querySelectorAll.bind(document);

// Generate a random number around `number` with range `bounds`
function fuzz(number, bounds) {
  return number + 2 * bounds * (Math.random() - 0.5);
}

// Clamps `value` between `min` and `max`. ie. Return the boundaries if `value` exceeds them.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Generates a random number from a gaussian distribution around `mu` with standard dev `sigma`
function gauss(mu, sigma) {
  return mu + sigma * clamp(Array.from({length:20}, Math.random).reduce((x,y)=>x+y)-10, -2, 2);
}

// Calculates the angle between two points
function angle(p0, p1) {
  return Math.atan2(p1.y-p0.y, p1.x-p0.x);
}

/**
 * Generates a function that that smoothly interpolates between `start` and `stop`
 * using `lead` and `trail` for the slope before and after `start` and `stop`
 * respectively
 */
function smoothstep(lead, start, stop, trail) {
  const s1 = Math.tan((angle(stop, start)+angle(lead, start))/2);
  const s2 = Math.tan((angle(trail, stop)+angle(start, stop))/2);

  const a0 = s2+s1 - 2*(stop.x-start.x);
  const a1 = 3*(stop.x-start.x) - (s2+2*s1);
  const a2 = s1;
  const a3 = start.x;
  return d => ((a0*d + a1)*d + a2)*d + a3;
}

// Returns a random item from the array
Array.prototype.sample = function() {
  return this[Math.floor(Math.random() * this.length)];
}

// Rendering Helpers

// Applies props to svg object el
function svgProps(el, props) {
  for (prop in props)
    el.setAttribute(prop, props[prop]);
  return el;
}

// Creates an svg with tag `tag`, applies `props`, and gives it `children`
function svg(tag, props, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  svgProps(el, props);
  children.map(el.appendChild.bind(el));
  return el;
}

// Creates an rgb color given shade of grey
function gray(shade) {
  return `rgb(${shade},${shade},${shade})`;
}

// List of color ranges for lerping as altitude increases [inside, outside]
let colorRanges = [
  ['#323232', '#555555'],
  ['#364856', '#547b99'],
  ['#114b77', '#1c76bc'],
  ['#0a525b', '#0d7482'],
];

// Smoothly interpolates between colors a and b as a function of t
function lerpColor(a, b, t) { 
  let aHex = parseInt(a.replace(/#/g, ''), 16),
      aRed = aHex >> 16, aGreen = aHex >> 8 & 0xff, aBlue = aHex & 0xff,
      bHex = parseInt(b.replace(/#/g, ''), 16),
      bRed = bHex >> 16, bGreen = bHex >> 8 & 0xff, bBlue = bHex & 0xff,
      red = aRed + t * (bRed - aRed),
      green = aGreen + t * (bGreen - aGreen),
      blue = aBlue + t * (bBlue - aBlue);
  return '#' + ((1 << 24) + (red << 16) + (green << 8) + blue | 0).toString(16).slice(1);
}

// Scales a number based on the width or height of the display
function scale(s) {
  return s*900;
  // return s*Math.min(document.body.clientWidth, document.body.clientHeight);
}

// Removes the width/height scale from a number
function unscale(s) {
  return s/900;
  // return s/Math.min(document.body.clientWidth, document.body.clientHeight);
}

// Calculates a svg path for any line around a circle
function calcSvgLinePath(x, y, start, stop, deg) {
  return `M ${
    x + Math.cos(-deg) * start
  } ${
    y + Math.sin(-deg) * start
  } L ${
    x + Math.cos(-deg) * stop
  } ${
    y + Math.sin(-deg) * stop
  }`;
}

// Creates a sprite using svg use from def `id`
function useSprite(id) {
  var sprite = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  sprite.setAttributeNS('http://www.w3.org/1999/xlink','href', id);
  return sprite;
}

// Generates an SVG rectangle
function rect(x, y, width, height, rot, color, glow) {
  return svg('rect', {
    x, y, width, height,
    transform: `rotate(${rot},${x+width/2},${y+height/2})`,
    fill: typeof color === 'number' ? gray(color) : color,
    ...(glow ? {
      stroke: gray(Math.min(color+20, 255)),
      'stroke-width': 5,
      'stroke-dasharray': `0 ${width + height} ${width + height}`
    } : {})
  });
}

// Generates an SVG arc
function arc(start, end, diameter, color, thickness) {
  return svg('path', {
    d: `M${start.x} ${start.y} A ${diameter} ${diameter} 1 0 0 ${end.x} ${end.y}`,
    stroke: color,
    fill: 'none',
    'stroke-width': thickness,
  });
}


// Specific Drawing Functions
// Calculates a svg path for a guage facing `deg`
function calcGaugeLine(deg) {
  return calcSvgLinePath(150, 150, 15,75, deg);
}

// Set the position of the plane
function setPlanePosition(x, y, deg) {
  svgProps($('#plane'), {
    transform: `translate(${x} ${y}) rotate(${deg}) scale(0.2 0.2)`,
  });
}

// Particles
const particles = [];
let screenRumble = 0;
function particle(x, y, size, color, lifeSpan, fn) {
  let svg_ = svg('rect', {
    x: x - size/2,
    y: y - size/2,
    width: size,
    height: size,
    fill: color,
  });
  let obj = {
    svg: svg_, x, y,
    lifeTime: lifeSpan,
  };
  fn = fn.bind(obj);
  obj.tick = (lifeTime, delta) => {
    svgProps(svg_, fn(Math.max(0, lifeTime / lifeSpan), delta));
  };
  svgProps(svg_, fn(0, 0));
  $('#particles').appendChild(svg_);
  particles.push(obj);
}

// Creates a gatling bullet with origin `x`, `y` to move toward angle `angle`
function createGatlingBullet(x, y, angle) {
  const bullet = svg('path', {stroke: '#ffff00', 'stroke-width': 3});
  $('#elems').appendChild(bullet);

  let dist = 63;
  let maxDist = 1000 - Math.random()*200;

  particle(
    x + Math.cos(angle) * 80,
    y - Math.sin(angle) * 80,
    20, '#ffff00', 0.5, function(t, dt) {
      let second = t / 0.9;
      let size = t > 0.9 ? 20 : second * 16;
      this.y -= dt * 50;
      return {
        fill: t > 0.9 ? '#ffff00' : lerpColor('#cccc00', '#000000', 1 - second),
        width: size,
        height: size,
        transform: `rotate(${t * Math.PI * 100} ${this.x} ${this.y})`,
        x: this.x - size/2,
        y: this.y - size/2,
      }
    }
  );

  return {
    svg: bullet,
    x, y, angle,
    tick(deltaTime) {
      dist += deltaTime * 400;
      bullet.setAttribute('d', calcSvgLinePath(x, y, dist, dist + 20, angle));
      let projX = x + Math.cos(angle) * (dist + 20);
      let projY = y - Math.sin(angle) * (dist + 20);
      let playerDist = Math.hypot(projY - planePos.y, projX - planePos.x); // let
      playerTheta = Math.atan2(y - planePos.y, x - planePos.x);

      // Mediocre hit detection
      if(dist > maxDist || playerDist < 30) {
        if(playerDist < 30) {
          gasAmount -= 0.05;
          screenRumble = Math.min(screenRumble + 0.15, 0.6);
        }
        particle(projX, projY, 10, '#ffff00', 1,
                 function(t, dt) {
                   let second = t / 0.9; let size = t > 0.9 ? 10 : second * 8;
                   return {
                     fill: t > 0.9 ? '#ffff00' : lerpColor('#aaaa00', '#000000', 1 - second),
                     width: size, height: size,
                     transform: `rotate(${t * Math.PI * 100} ${this.x} ${this.y})`,
                     x: this.x - size/2, y: this.y - size/2
                   };
                 });
        return true;
      }
    }
  };
}

/* Creates an anti-air rocket from x, y, to move in `angle` direction */
function createAntiAirRocket(x, y, angle) {
  const rocket = useSprite('#rocket')
  x += Math.cos(angle) * 40;
  y +=  Math.sin(angle) * 40;

  // Create gunsmoke particle from the AA launcher
  particle(
    x,
    y,
    40, '#aaaaaa', 1, function(t, dt) {
      let second = t / 0.9;
      let size = t > 0.9 ? 40 : second * 30;
      this.y -= dt * 50;
      return {
        fill: t > 0.9 ? '#aaaaaa' : lerpColor('#999999', '#000000', 1 - second),
        width: size,
        height: size,
        transform: `rotate(${t * Math.PI * 50} ${this.x} ${this.y})`,
        x: this.x - size/2,
        y: this.y - size/2,
      }
    });

  rocket.setAttribute('transform', `translate(${x} ${y}) scale(0.4 0.4) rotate(${deg(angle)})`);
  $('#elems').appendChild(rocket);


  let dist = Math.random() * 3;
  let nextSmoke = 0;
  return {
    svg: rocket,
    x, y, angle,
    tick(deltaTime) {
      dist += deltaTime * 5;
      let currAngle = angle + Math.cos(dist) * Math.PI / 6;

      let playerDist = Math.hypot(y - planePos.y, x - planePos.x);
      let playerTheta = Math.atan2(y - planePos.y, x - planePos.x);

      if(playerDist < 400) {
        dist -= deltaTime * 2;
        angle = Math.atan2(
          Math.sin(angle) - Math.sin(playerTheta) * deltaTime * 2,
          Math.cos(angle) - Math.cos(playerTheta) * deltaTime * 2);
      }

      x += Math.cos(currAngle) * 200 * deltaTime;
      y += Math.sin(currAngle) * 200 * deltaTime;

      rocket.setAttribute('transform', `translate(${x} ${y}) scale(0.4 0.4) rotate(${deg(currAngle) + 90})`);
      
      nextSmoke -= deltaTime;
      if(nextSmoke < 0) {
        nextSmoke = 0.1;

        // Create trail particle from rocket
        particle(
          x - Math.cos(currAngle) * 50,
          y - Math.sin(currAngle) * 50,
          15, 'transparent', 1, function(t, dt) {
            let second = t / 0.9;
            let size = t > 0.9 ? 15 : second * 10;
            this.x -= Math.cos(currAngle) * dt * 100;
            this.y -= Math.sin(currAngle) * dt * 100;
            return {
              fill: t > 0.9 ? 'transparent' : lerpColor('#999999', '#000000', 1 - second),
              width: size,
              height: size,
              transform: `rotate(${t * Math.PI * 200} ${this.x} ${this.y})`,
              x: this.x - size/2,
              y: this.y - size/2,
            }
          });
      }

      
      // Kill projectile after max dist or when near player
      // Mediocre hit detection
      if(dist > 40 || playerDist < 50) {
        if(playerDist < 400) {
          screenRumble = 0.4;
          gasAmount -= clamp((1 - playerDist / 400) * 0.2, 0.2, 0.005);
        }
        particle(
          x,
          y,
          50, '#ffff00', 1, function(t, dt) {
            let second = t / 0.9;
            let size = t > 0.9 ? 50 : second * 30;
            return {
              fill: t > 0.9 ? '#ffff00' : lerpColor('#aaaa00', '#000000', 1 - second),
              width: size,
              height: size,
              transform: `rotate(${t * Math.PI * 50} ${this.x} ${this.y})`,
              x: this.x - size/2,
              y: this.y - size/2,
            }
          });
        return true;
      }
    }
  }
}


const gameObjects = [];

/* Creates a gatling gun object at a given position facing right if direction */
function createGatlingGun(x, y, direction) {
  let dir = direction ? -1 : 1;
  let baseSprite = useSprite('#gatling-base');
  let gunSprite = useSprite('#gatling-gun');
  const group = svg('g', {}, baseSprite, gunSprite);

  baseSprite.setAttribute('transform', `translate(${x} ${y}) scale(0.4 0.4)`);
  gunSprite.setAttribute('transform', `translate(${x} ${y}) scale(${dir * 0.4} 0.4)`);

  $('#elems').appendChild(group);
  let lastShot = 0;
  let renderAngle = 0;
  let burstCounter = 5;

  let gun = {
    svg: group,
    x, y, direction,
    tick(deltaTime) {
      let playerDist = Math.hypot(y - planePos.y, x - planePos.x);
      let angle = (direction ? Math.PI : 0) + Math.atan2(y - planePos.y, x - planePos.x) * dir;
      if(angle > Math.PI)
        angle = -2 * Math.PI + angle;
      if(playerDist < GAT_TURRET_RANGE && Math.abs(angle) < Math.PI / 6) {
        // Calculate angle between turret and player

        // Clamp angle
        angle = clamp(angle, -Math.PI/6, Math.PI/6);

        // Rotate the turret to point at the player
        lastShot -= deltaTime;
        if(lastShot < 0) {
          lastShot = 0.1;
          if(--burstCounter <= 0) {
            lastShot = 1;
            burstCounter = 5;
          }
          let offset = (Math.random() - 0.5) * 0.1;
          gameObjects.push(createGatlingBullet(x, y, (direction ? 0 : Math.PI) - renderAngle * dir + offset));
        }
      } else {
        angle = Math.sin(Date.now() * 0.001 + x * 3 + y * 2) * Math.PI/6;
      }

      renderAngle += (angle - renderAngle) * deltaTime * 2;

      gunSprite.setAttribute('transform', `translate(${x} ${y}) scale(${dir * 0.4} 0.4) rotate(${deg(renderAngle)})`);

    }
  };
  return gun;
}

/* Creates a gas can object at a given position*/
function createGasCan(x, y) {
  let sprite = useSprite('#gas-can');
  
  $('#elems').appendChild(sprite);
  sprite.setAttribute('transform', `translate(${x} ${y})`);
  
  let can = {
    svg: sprite,
    x, y,
    tick(deltaTime) {
      const playerDist = Math.hypot(y - planePos.y, x - planePos.x);
      if(playerDist < 50) {
        gasAmount = 1;
        const startAngle = Math.random() * Math.PI / 2;
        const numParticles = Math.floor(Math.random() * 4 + 4);
        const partDist = Math.PI * 2 / numParticles;
        for(let i = 0; i < numParticles; i++) {
          const partTheta = startAngle + partDist * i;
          particle(
            x,
            y,
            30, 'transparent', 0.5, function(t, dt) {
              let size = t * 30;
              this.x -= Math.cos(partTheta) * dt * 100;
              this.y -= (Math.sin(partTheta) * 100 + 100) * dt;
              return {
                fill: lerpColor('#00ff00', '#ffffff', t),
                opacity: t,
                width: size,
                height: size,
                transform: `rotate(${t * Math.PI * 50} ${this.x} ${this.y})`,
                x: this.x - size/2,
                y: this.y - size/2,
              }
            });
        }
        return true;
      }

      sprite.setAttribute('transform', `translate(${x} ${y}) rotate(${Math.sin(performance.now() * 0.03) * 5})`);
    }
  };
  return can;
}


/* Creates an anti-air launcher object at a given position facing right if direction */
function createAntiAir(x, y, direction) {
  let dir = direction ? -1 : 1;
  let baseSprite = useSprite('#anti-air-base');
  const group = svg('g', {}, baseSprite);

  baseSprite.setAttribute('transform', `translate(${x} ${y}) scale(${dir * 0.4} 0.4)`);
  
  $('#elems').appendChild(group);
  let lastShot = 0;

  let gun = {
    svg: group,
    x, y, direction,
    tick(deltaTime) {
      let playerDist = Math.hypot(y - planePos.y, x - planePos.x);

      if(playerDist < ANTIAIR_TURRET_RANGE) {
        // Rotate the turret to point at the player
        lastShot -= deltaTime;
        if(lastShot < 0) {
          lastShot = 2;

          let offset = (Math.random() - 0.5) * 0.2;
          gameObjects.push(createAntiAirRocket(x, y - 20, (direction ? 0 : Math.PI) + Math.PI / 9 * dir + offset));
        }
      }
    }
  };
  return gun;
}


// Gravity that is applied to the plane in pixels per second
const GRAVITY = 400;

// Max player speed in pixels per second
const MAX_SPEED = 500;
// Player throttle speed
const THROTTLE_SPEED = 25;

// Range in which a gatling turret can see a player
const GAT_TURRET_RANGE = 600;
const ANTIAIR_TURRET_RANGE = 900;

// Plane transform
let planePos = {angle: Math.PI/2, x: 0, y: 0, vx: 0, vy: -200};
let gasAmount = 0.5;

/* Rotate the gas gauge an `amount` from 0 to 1*/
function setGas(amount) {
  svgProps($('#gas-gauge'), {
    d: calcGaugeLine(Math.PI * ((1 - amount) * 1.28 + 0.22)),
    stroke: amount < 0.2
      ? lerpColor('#ff7722', '#ffff22', Math.sin(Date.now() * 0.01) * 0.5 + 0.5)
      : '#77ff22',
  });
}

/* Rotate the rpm gauge an `amount` from 0 to 1*/
function setRpm(amount) {
  $('#rpm-gauge').setAttribute('d', calcGaugeLine(Math.PI * ((1 - amount) * 1.67 + 1.67)));
}


// Dot between two vecotrs
function vecDot(a, b) {
  return a.x*b.x + a.y*b.y;
}

// Length of a vector
function vecLen(a) {
  return Math.hypot(a.x, a.y);
}

// Adds two vectors together
function vecAdd(a, b) {
  return {x: a.x+b.x, y: a.y+b.y};
}

// Scale vector
function vecScale(v, mag) {
  return {x: v.x*mag, y: v.y*mag};
}

// Normalizes a vector
function vecNormal(v) {
  const abs = vecLen(v);
  return {x: v.x/abs, y: v.y/abs};
}

// Rotates a vector by `rad` radians
function vecRotate(v, rad) {
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {x: vecDot(v, {x: cos, y: -sin}),
          y: vecDot(v, {x: sin, y: cos})};
}

// Creates vector from polar coords
function vecFromPolar(theta, mag) {
  return {x: Math.cos(theta) * mag, y: Math.sin(theta) * mag};
}

const deg = rad => 180 * rad / Math.PI;

// Promise for next frame, resolves high quality timestamp
function nextFrame() {
  return new Promise(window.requestAnimationFrame);
}

function resolveGen(gen) {
  return (typeof(gen) === "function") ? gen() : gen;
}

// Generator stuff
function* group(n, gen_) {
  const gen = resolveGen(gen_);
  while (true)
    yield Array.from({length:n}, ()=>gen.next().value);
}

function lazyList(generator_) {
  const generator = (typeof generator_ === "function") ? generator_() : generator_;
  return new Proxy([], {
    get: (target, prop) => {
      const num = Number(prop);
      if (!(prop in target) && Number.isSafeInteger(num))
        while (target.length <= num)
          target.push(generator.next().value);
      return target[prop];
    }
  })
}


// TerrainGen
const terrainGroupSize = 20;
const pointDeltaY = 0.5;
const nPoints = 10;

function generateTerrain() {
  const terrainPath = lazyList(function*() {
    let lastPoint = 0;
    for (let y = 0;; y += pointDeltaY)
      yield {
        x: lastPoint=gauss(lastPoint, 0.15),
        y,
        width: fuzz(0.9, 0.2)
      };
  });

  return lazyList(group(terrainGroupSize, function*() {
    for (let i = 0;; ++i) {
      const points = [terrainPath[i], terrainPath[i+1]];
      const segments = [
        (i-1 >= 0) ? terrainPath[i-1] : {x: 0, y: -pointDeltaY, width: 0.5},
        ...points, terrainPath[i+2]
      ];
      const leftSpline = smoothstep(...segments.map(({x, y, width}) => ({x: x-width/2, y})));
      const rightSpline = smoothstep(...segments.map(({x, y, width}) => ({x: x+width/2, y})));

      for (let j = 0; j < nPoints; ++j) {
        const y = points[0].y + (j/nPoints)*(points[1].y-points[0].y);
        const guns = () => {
          if (i < 10)
            return;
          let r = Math.random();
          return r < 0.02 ? {rocket: true} : r < 0.04 ? {gatling: true} : {};
        };
        const common = rot => ({
          y, ...guns(),
          rot: fuzz(rot + 45, 45),
          size: fuzz(0.07, 0.02),
        });
        yield {
          gas: Math.random() < 0.013,
          vine: Math.random() < 0.05,
          left: {x: leftSpline(j/nPoints), ...common(180)},
          right: {x: rightSpline(j/nPoints), ...common(0)}
        }
      }
    }
  }));
}

function getTerrainForYRange(terrain, start_, end_) {
  const indivHeight = pointDeltaY/nPoints;
  const start = 1-unscale(start_), end = 1-unscale(end_);
  const startBound = Math.max(Math.floor(start/indivHeight), 0);
  const endBound = Math.ceil(end/indivHeight);
  if (endBound < 0)
    return [];
  const chunkStart = Math.floor(startBound/terrainGroupSize);
  const chunkEnd = Math.floor(endBound/terrainGroupSize)
  if (chunkStart == chunkEnd) {
    return terrain[chunkStart].slice(startBound%terrainGroupSize, endBound%terrainGroupSize+1);
  } else {
    terrain[chunkEnd];
    return [
      ...terrain[chunkStart].slice(startBound%terrainGroupSize),
      ...[].concat(...terrain.slice(chunkStart+1, chunkEnd)),
      ...terrain[chunkEnd].slice(0, endBound%terrainGroupSize+1)
    ];
  }
}


// Function that tells devices to use fullscreen
function requestFullscreen() {
  const e = document.documentElement;
  const req = e.requestFullscreen || e.mozRequestFullScreen
        || e.webkitRequestFullScreen || docEl.msRequestFullscreen;
  if (!document.fullscreenElement && !document.mozFullScreenElement
      && !document.webkitFullscreenElement && !document.msFullscreenElement)
    req.call(e);
}

// Keyboard Handling
const keyboard = {};
window.addEventListener('keydown', e => {
  keyboard[e.code] = true;
}, false);
window.addEventListener('keyup', e => {
  keyboard[e.code] = false;
}, false);

// Touch event handling
const touch = {down: false, pos: {x: 0, y: 0}};
function handleTouch(e) {
  let touches = Array.from(e.touches);
  if (touch.down = !!touches.length) {
    touch.pos.x = touches.map(x=>x.clientX).reduce((x,y)=>x+y)/touches.length;
    touch.pos.y = touches.map(x=>x.clientY).reduce((x,y)=>x+y)/touches.length;
  }
}
['start', 'end', 'move'].map(x=>document.body.addEventListener('touch'+x, handleTouch, false));


// Prevent touch events from being registered as clicks and reuqest full screen
document.body.addEventListener('click', e => {e.preventDefault(); requestFullscreen();}, false);

const userAgent = (navigator.userAgent||navigator.vendor||window.opera);
  window.IS_MOBILE = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(userAgent)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(userAgent.substr(0,4));

  if(IS_MOBILE) {
    svgProps($('.hud-rpm'), {width: '200'});
    svgProps($('.hud-gas'), {width: '200'});
  }

// Adds each prop into whatever value is already in obj
function addProps(obj, props) {
  obj = JSON.parse(JSON.stringify(obj))
  for(prop in props)
    obj[prop] += props[prop];
  return obj;
}

// Removes all children from an element
function emptyElem(el) {
  while(el.firstChild)
    el.removeChild(el.lastChild);
}

// Seconds of title sequence
let titleSequence = 2;

async function main() {
  $('#main-menu').style.display = 'none';
  $('#gameover-screen').style.display = 'none';

  emptyElem($('#elems'));
  emptyElem($('#fg'));
  emptyElem($('#bg'));
  emptyElem($('#particles'));
  gameObjects.splice(0, gameObjects.length);
  particles.splice(0, particles.length);

  setPlanePosition(-200, -200, 0);
  planePos = {angle: Math.PI/2, x: 0, y: 0, vx: 0, vy: -200};
  let gameMaxAlt = 0;

  // Creates a lazy list of terrain elements
  const terrain = generateTerrain();

  const initialTerrain =
        getTerrainForYRange(terrain, -200+scale(0.09), -200-scale(0.09));
  console.log(initialTerrain);
  const initUnscaledPos = (
    initialTerrain.map(x=>x.left.x).reduce((x,y)=>x+y) +
      initialTerrain.map(x=>x.right.x).reduce((x,y)=>x+y)
  )/2/initialTerrain.length;
  console.log(initUnscaledPos);
  planePos.x = scale(initUnscaledPos);
  planePos.y = -200;
  setPlanePosition(planePos.x, planePos.y, 0);

  let highestTerrainElement = -1;
  let groupNum = -1;

  // Properties of the current game
  const planeBodyColor = [
      'red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'
  ].sample();
  $all('.plane-body').forEach(
    e => e.setAttribute('fill', planeBodyColor)
  );

  // Guages
  let gasRenderAmount = 1;
  let gasInertia = 0;
  let rpmRenderAmount = 0;
  let rpmInertia = 0;

  // Time between gas particles
  let gasParticle = 0;

  // Seconds of altitude glow
  let altGlow = 0, maxAlt = +localStorage.maxAlt || 0;
  $('#alt-text').textContent = Math.floor(maxAlt);

  // wind particle generation
  let windPart = 0;

  // Seconds of screen rumble
  const initialFrameTime = await nextFrame();

  let frameCounter = 0;
  let frameCounterTime = initialFrameTime;

  let frameTime = initialFrameTime;

  gasAmount = 0.5;
  gameObjects.push(createGasCan(planePos.x, planePos.y - 200));

  while (true) {
    const deltaTime = Math.min(-(frameTime - (frameTime = await nextFrame())) / 1000, 0.1);
    frameCounter++;
    if (frameTime - frameCounterTime > 1000) {
      console.log(`${frameCounter} FPS`);
      frameCounter = 0;
      frameCounterTime = frameTime;
    }

    const {clientWidth: width, clientHeight: height} = document.body;

    // Title sequence animation
    if (titleSequence > 0) {
      titleSequence -= deltaTime;

      if(titleSequence > 1.25) {
        let grad = (2 - titleSequence) / 0.75;
        svgProps($('#title-text'), {
          x: width/2,
          y: height/2 + 200 - grad ** 3 * 200,
          'font-size': grad ** 3 * 100 + 20,
          opacity: grad * 0.6,
        });

      } else if(titleSequence < 0.75) {
        let grad = titleSequence / 0.75;
        svgProps($('#title-text'), {
          x: width/2,
          y: height/2 - (1 - grad) * 500,
          'font-size': grad ** 2 * 20 + 100,
          opacity: grad * 0.6,
          fill: 'white',
          transform: `rotate(0)`,
        });

      } else {
        let grad = (titleSequence - 0.75) / 0.5;
        svgProps($('#title-text'), {
          x: width/2,
          y: height/2,
          'font-size': Math.sin(grad * Math.PI) * 15 + 120,
          fill: '#9999ff',
          transform: `rotate(${Math.sin(grad * Math.PI * 2) * 4} ${width/2} ${height/2})`,
          opacity: 0.9,
        });
      }
    } else {
      titleSequence = 0;
    }

    // Run game logic for gameObjects, cull when necessary
    gameObjects.map((e, i) => {
      if(e.tick(deltaTime)) {
        e.svg.parentNode.removeChild(e.svg);
        gameObjects.splice(i, 1);
      }
    });

    // Run logic for particles, cull when lifetime runs out
    particles.map((e, i) => {
      e.lifeTime -= deltaTime;
      e.tick(e.lifeTime, deltaTime);
      if(e.lifeTime <= 0) {
        e.svg.parentNode.removeChild(e.svg);
        particles.splice(i, 1);
      }
    });

    // Give the gas gauge a nice smooth feeling
    gasInertia += (gasAmount - gasRenderAmount) * 0.8 * deltaTime;
    gasInertia -= 3 * gasInertia * deltaTime;
    gasRenderAmount += gasInertia * deltaTime * 20;
    setGas(gasRenderAmount);

    // How fast the plane should turn
    let deltaAngle = 0;

    // How much throttle to apply to plane
    let throttle = 0;

    // Plane rotation controls
    if(keyboard.KeyA) {
      deltaAngle += -Math.PI * 2;
    }
    
    if(keyboard.KeyD) {
      deltaAngle += Math.PI * 2;
    }

    // Touch/mobile controls
    let xTouch = touch.pos.x/width;
    let yTouch = touch.pos.y/height;
    if(touch.down && xTouch < 0.40) {
      deltaAngle -= Math.PI * 2 * (1 - xTouch / 0.40);
    }

    if(touch.down && xTouch > 0.60) {
      deltaAngle += Math.PI * 2 * (xTouch - 0.60) / 0.40;
    }

    if(touch.down) {
      throttle = yTouch;
    }

    // Rotate plane
    planePos.angle += deltaAngle * deltaTime;

    if(keyboard.KeyW) {
      throttle = 1;
    }

    // Rotate plane prop based on throttle
    $('#plane-prop').setAttribute('ry', Math.sin(frameTime * (0.02 + 0.8 * throttle)) * 60 + 60);

    if(gasAmount <= 0) {
      throttle = 0;
      gasAmount = 0;
    }

    gasAmount -= deltaTime * throttle * 0.01;

    // Increase gas particle rate when throttling
    gasParticle -= deltaTime * throttle + deltaTime;

    // Emit gas particles
    if(gasParticle < 0) {
      gasParticle = 0.2;
      const gasAngle = planePos.angle + Math.PI / 5 + Math.random() * 0.2 - 0.1;
      const gasSize = Math.random() * 20 + 10;
      const needGas = gasAmount < 0.1;
      const gasSpeed = throttle + 1 + needGas ? -0.5 : 0;
      if(needGas)
        gasParticle -= 0.1;
      particle(
        planePos.x + Math.cos(gasAngle) * 15,
        planePos.y + Math.sin(gasAngle) * 15,
        gasSize, needGas ? '#f00' : '#ccc', needGas ? 1 : 0.7, function(t, dt) {
          let size = t * 0.6 * gasSize + gasSize * 0.4;
          this.x += Math.cos(gasAngle) * dt * 80 * gasSpeed;
          this.y += Math.sin(gasAngle) * dt * 80 * gasSpeed;
          return {
            opacity: needGas ? t * 0.5 + 0.5 : t * 0.3 + 0.1,
            width: size,
            height: size,
            fill: needGas ? lerpColor('#000000', '#cc6600', t) : '#ccc',
            transform: `rotate(${t * Math.PI * 20 * (needGas ? 10 : 1)} ${this.x} ${this.y})`,
            x: this.x - size/2,
            y: this.y - size/2,
          }
        });
    }

    let accelDir = {
      x: Math.cos(planePos.angle + Math.PI) * THROTTLE_SPEED * throttle,
      y: Math.sin(planePos.angle + Math.PI) * THROTTLE_SPEED * throttle,
    };

    // Calculate new velocity based on projected velocity and previous velocity
    let prevVel = {x: planePos.vx, y: planePos.vy};
    let projVel = vecDot(prevVel, vecNormal(accelDir));
    let accelVel = throttle * THROTTLE_SPEED * deltaTime;

    if(projVel + accelVel > MAX_SPEED)
      accelVel = Math.max(MAX_SPEED - projVel, 0);

    let newVel = vecAdd(prevVel, vecScale(accelDir, accelVel));

    // Calculate how much impact the wings have on movement direction
    let wingDir = vecFromPolar(planePos.angle, 1);
    let inertia = deltaTime * 4;
    newVel = vecAdd(vecScale(newVel, 1 - inertia), vecScale(wingDir, vecDot(newVel, wingDir) * inertia));

    if(vecLen(newVel) > MAX_SPEED - 30) {
      windPart -= deltaTime;
      if(windPart < 0) {
        windPart = 0.05;
        const partTheta = Math.random() * 6.28;
        const partDist = Math.random() * 100 + 50;
        const partSize = Math.random() * 5 + 2;
        particle(planePos.x + Math.cos(partTheta) * partDist,
          planePos.y + Math.sin(partTheta) * partDist,
          partSize, '#fff', 0.5, function(t, dt) {
            this.x -= newVel.x * dt * 0.5;
            this.y -= newVel.y * dt * 0.5;
            return {
              opacity: t * 0.5,
              x: this.x - partSize/2,
              y: this.y - partSize/2,
            }
          });
      }
    }

    // Smooth render the rpm gauge
    let rpmAmount = Math.max(Math.min(-vecDot(newVel, wingDir) / 500, 1), 0);
    rpmInertia += (rpmAmount - rpmRenderAmount) * 0.8 * deltaTime;
    rpmInertia -= 6 * rpmInertia * deltaTime;
    rpmRenderAmount += rpmInertia * deltaTime * 40;
    setRpm(Math.min(Math.max(rpmRenderAmount, 0), 1.1));

    // Update plane velocity, apply gravity
    planePos.vx = newVel.x;
    planePos.vy = newVel.y;
    planePos.vy += GRAVITY * deltaTime; 

    // Gravity and base movement
    planePos.x += planePos.vx * deltaTime;
    planePos.y += planePos.vy * deltaTime;

    // Move plane sprite
    setPlanePosition(planePos.x, planePos.y, deg(planePos.angle));

    // Collision Detection
    let above, below;
    getTerrainForYRange(terrain, planePos.y+scale(0.09), planePos.y-scale(0.09)).forEach(chunk=>{
      if (scale(1-chunk.left.y) >= planePos.y)
        if (!above || chunk.left.y < above.left.y)
          above = chunk;
      if (scale(1-chunk.left.y) <= planePos.y)
        if (!below || chunk.left.y > below.left.y)
          below = chunk;
    });
    if (above && below && (planePos.x < scale(above.left.x + below.left.x) / 2 ||
                           planePos.x > scale(above.right.x + below.right.x) / 2)) {
      break;
    }

    // This would work better, but it seems hard
    // (function(){
    //   const planeBox = $('#plane').getBBox();
    //   const transform = {
    //     sin: Math.sin(planePos.angle),
    //     cos: Math.cos(planePos.angle)
    //   };
      
    // })()

    // Render the terrain chunk at a time
    if (unscale(3*height-planePos.y) > highestTerrainElement) {
      groupNum++;
      function makeVertex({x, y}) {
        return `${scale(x)},${scale(1-y)}`;
      }
      const lowerPoly = svg('polygon', {
        points: [
          ...(groupNum > 0 ? [makeVertex(terrain[groupNum-1][terrainGroupSize-1].left)] : []),
          ...terrain[groupNum].map(x=>makeVertex(x.left)),
          ...terrain[groupNum].map(x=>makeVertex(x.right)).reverse(),
          ...(groupNum > 0 ? [makeVertex(terrain[groupNum-1][terrainGroupSize-1].right)] : [])
        ].join(' '),
        fill: gray(50),
      });

      const innerDist = 0.10;
      const innerPoly = svg('polygon', {
        points: [
          ...(groupNum > 0 ? [makeVertex(addProps(terrain[groupNum-1][terrainGroupSize-1].left, {x: innerDist}))] : []),
          ...terrain[groupNum].map(x=>makeVertex(addProps(x.left, {x: innerDist}))),
          ...terrain[groupNum].map(x=>makeVertex(addProps(x.right, {x: -innerDist}))).reverse(),
          ...(groupNum > 0 ? [makeVertex(addProps(terrain[groupNum-1][terrainGroupSize-1].right, {x: -innerDist}))] : [])
        ].join(' '),
        fill: gray(0),
      });

      const square = ({x, y, rot, size}, color) => {
        const screenSize = scale(size);
        return rect(scale(x-size/2), scale(1-y-size/2),
                    screenSize, screenSize, rot, color, true);
      };

      const makeVine = (start, end) => {
        const s = scale(1);
        const topThick = fuzz(10, 2);
        const diameter = s * Math.hypot(start.y-end.y, start.x-end.x) * fuzz(1.2, 0.1);
        const topVine = arc(
          {x: s * (start.x), y: scale(1-start.y)},
          {x: s * (end.x), y: scale(1-end.y)},
          diameter,
          lerpColor('#226622', '#004400', Math.random()), topThick);
        let leaves = [];
        for(let d = 0.2; d < 0.8; d += fuzz(0.1, 0.07)) {
          let { x, y } = topVine.getPointAtLength(d * s * topVine.getTotalLength());
          let leavesAngle = fuzz(90, 5);
          const vineLen = Math.floor(fuzz(6, 4));
          const startColor = lerpColor('#226622', '#004400', Math.random());
          const endColor = lerpColor('#55aa55', '#338833', Math.random());
          for(let i = 0; i < vineLen; i++) {
            leaves.push(rect(x, y, 20, 20, leavesAngle + 45, lerpColor(endColor, startColor, i/vineLen)));
            leavesAngle = leavesAngle * 0.8 + 90 * 0.2;
            x += Math.cos(leavesAngle * Math.PI / 180) * 20;
            y += Math.sin(leavesAngle * Math.PI / 180) * 20;
            leavesAngle += Math.sin(leavesAngle + i ) * 20;
          }
        }
        return svg('g', {},
          topVine,
          arc(
            {x: s * (start.x), y: scale(1-start.y) - topThick/2},
            {x: s * (end.x), y: scale(1-end.y) - topThick/2},
            diameter,
            lerpColor('#55aa55', '#338833', Math.random()), 2),
          ...leaves
        );
      };
      
      const upperGroup = svg('g', {}, ...[].concat(...terrain[groupNum].map(
        ({left, right}) => [square(left, 85), square(right, 85)]
      )));

      const innerGroup = svg('g', {}, ...[].concat(...terrain[groupNum].map(
        ({left, right}) => [
            square(addProps(left, {
              x: innerDist,
              rot: fuzz(0, 20),
              size: fuzz(0.01, 0.01),
            }), 50),
            square(addProps(right, {
              x: -innerDist,
              rot: -fuzz(0, 20),
              size: fuzz(0.01, 0.01),
            }), 50)
          ]
      )));
      
      terrain[groupNum].map(({left, right, gas}) => {
        if(gas) {
          let side = Math.random() * 0.4 + 0.3;
          gameObjects.push(createGasCan(scale(left.x * side + right.x * (1-side)), scale(1-left.y)));
        }
      });

      terrain[groupNum].map(x=>x.left).filter(x=>x.rocket).map(({x,y,size})=>{
        gameObjects.push(createAntiAir(scale(x-size/2), scale(1-y-size/2), true));
      });
      terrain[groupNum].map(x=>x.right).filter(x=>x.rocket).map(({x,y,size})=>{
        gameObjects.push(createAntiAir(scale(x+size/2), scale(1-y-size/2), false));
      });

      terrain[groupNum].map(x=>x.left).filter(x=>x.gatling).map(({x,y,size})=>{
        gameObjects.push(createGatlingGun(scale(x-size/2), scale(1-y-size/2), true));
      })
      terrain[groupNum].map(x=>x.right).filter(x=>x.gatling).map(({x,y,size})=>{
        gameObjects.push(createGatlingGun(scale(x+size/2), scale(1-y-size/2), false));
      });

      $('#bg').appendChild(lowerPoly);
      $('#bg').appendChild(innerPoly);
      $('#fg').appendChild(innerGroup);

      terrain[groupNum].map(({left, right, vine}) => {
        if(vine) {
          $('#fg').appendChild(makeVine(left, right));
        }
      });

      if(groupNum == 0) {
        const end = terrain[0][0].right.x - 0.1;
        const y = terrain[0][0].left.y;
        let base = [];
        let back = [];
        for(let x = terrain[0][0].left.x + 0.1; x < end;) {
          let size = fuzz(0.1, 0.02);
          x += size / 2;
          base.push(square({
            x, y, size,
            rot: fuzz(135, 15),
          }, 50));
          back.push(square({
            x: x * 1.1, y: y - 0.1, size: size * 1.1,
            rot: fuzz(135, 15),
          }, 85));
        }
        while(base.length) {
          $('#fg').appendChild(base.splice(Math.floor(Math.random() * base.length), 1)[0]);
        }
        while(back.length) {
          $('#fg').appendChild(back.splice(Math.floor(Math.random() * back.length), 1)[0]);
        }
      }
      $('#fg').appendChild(upperGroup);

      highestTerrainElement = terrain[groupNum][terrainGroupSize-1].left.y;
    }


    let rumbleOffX = 0;
    let rumbleOffY = 0;
    // Rumble screen increasingly when there is more demand for rumble
    if(screenRumble > 0) {
      screenRumble -= deltaTime;
      rumbleOffX = (Math.random() - 0.5) * screenRumble * 50;
      rumbleOffY = (Math.random() - 0.5) * screenRumble * 50;
    }

    // Move camera to player
    let renderScale = IS_MOBILE ? 0.8 : 1;
    $('#world').setAttribute('transform', `translate(${
      -planePos.x * renderScale + width/2 + rumbleOffX
    } ${
      -planePos.y * renderScale + height/2 + rumbleOffY
    }) scale(${renderScale})`)

    // TODO: remove debug position resetting
    if(planePos.y > 1000) {
      planePos.y = 0;
      planePos.x = 0;
      planePos.vx = 0;
      planePos.vy = 0;
      break;
    }

    altGlow -= altGlow * deltaTime * 5;
    // Glow the altitude indicator every time a new milestone is reached
    if(maxAlt < Math.floor(-planePos.y/250)) {
      maxAlt = Math.floor(-planePos.y/250);
      localStorage.maxAlt = maxAlt;
      $('#alt-text').textContent = Math.floor(maxAlt);
      altGlow = 1;
    }

    if(gameMaxAlt < Math.floor(-planePos.y/250)) {
      gameMaxAlt = Math.floor(-planePos.y/250);
    }

    // Update altitude indicator appearance
    svgProps($('#alt-text'), {
      opacity: altGlow * 0.6 + 0.4,
      'font-size': altGlow * 5 + 30,
      y: 80 + altGlow * 2.5,
    });
  }

  $('#currAlt').textContent = Math.max(Math.floor(-planePos.y/250), 0);
  $('#maxAlt').textContent = gameMaxAlt;
  $('#gameover-screen').style.display = 'flex';
}

window.addEventListener('load', () => {
  $('.loading-screen').style.display = 'none';
  $('#canvas').style.display='inherit';
});

document.body.addEventListener('DOMContentLoaded', () => {
  $('.loading-screen').style.display = 'none';
  $('#canvas').style.display='inherit';
});
