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

// Scales a number based on the width or height of the display
function scale(s) {
  return s*Math.min(document.body.clientWidth, document.body.clientHeight);
}

// Removes the width/height scale from a number
function unscale(s) {
  return s/Math.min(document.body.clientWidth, document.body.clientHeight);
}

// Generates an SVG rectangle
function rect(x, y, width, height, rot, color, glow) {
  return svg('rect', {
    x, y, width, height,
    transform: `rotate(${rot},${x+width/2},${y+height/2})`,
    fill: gray(color),
    ...(glow ? {
      stroke: gray(Math.min(color+20, 255)),
      'stroke-width': 5,
      'stroke-dasharray': `0 ${width + height} ${width + height}`
    } : {})
  });
}


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
function generateTerrain() {
  const pointDeltaY = 0.5;

  const terrainPath = lazyList(function*() {
    let lastPoint = 0;
    for (let y = 0;; y += pointDeltaY)
      yield {
        x: lastPoint=gauss(lastPoint, 0.15),
        y,
        width: fuzz(0.8, 0.2)
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

      const nPoints = 10;

      for (let i = 0; i < nPoints; ++i) {
        const y = points[0].y + (i/nPoints)*(points[1].y-points[0].y);
        const common = rot => ({y, rot: fuzz(rot + 45, 45), size: gauss(0.07, 0.02)});
        yield {
          left: {x: leftSpline(i/nPoints), ...common(180)},
          right: {x: rightSpline(i/nPoints), ...common(0)}
        }
      }
    }
  }));
}


async function main() {
  // Creates a lazy list of terrain elements
  const terrain = generateTerrain();

  let highestTerrainElement = -1;
  let groupNum = -1;

  const initialFrameTime = await nextFrame();

  let frameCounter = 0;
  let frameCounterTime = initialFrameTime;

  let frameTime = initialFrameTime;

  while (true) {
    const deltaTime = Math.min(-(frameTime - (frameTime = await nextFrame())) / 1000, 0.1);
    frameCounter++;
    if (frameTime - frameCounterTime > 1000) {
      frameCounter = 0;
      frameCounterTime = frameTime;
    }

    const {clientWidth: width, clientHeight: height} = document.body;

    // Render the terrain chunk at a time
    if (2-unscale(planePos.y) > highestTerrainElement) {
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
        ].join(' ')
      });

      const square = ({x, y, rot, size}) => {
        const screenSize = scale(size);
        return rect(scale(x-size/2), scale(1-y-size/2),
                    screenSize, screenSize, rot, 85, true);
      }

      const upperGroup = svg('g', {}, ...[].concat(...terrain[groupNum].map(
        ({left, right}) => [square(left), square(right)]
      )));
      $('#bg').appendChild(lowerPoly);
      $('#fg').appendChild(upperGroup);
      highestTerrainElement = terrain[groupNum][terrainGroupSize-1].left.y;
    }
  }
}

window.addEventListener('load', () => {
  main();
});
