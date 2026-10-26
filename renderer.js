(function (root) {
  "use strict";

  const VERTEX_SHADER = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec4 aColor;
    uniform mat4 uViewProjection;
    uniform vec3 uCamera;
    varying vec4 vColor;
    varying float vLight;
    varying float vDistance;
    void main() {
      vec3 lightDirection = normalize(vec3(-0.55, 0.9, -0.35));
      float diffuse = max(dot(normalize(aNormal), lightDirection), 0.0);
      vLight = 0.48 + diffuse * 0.52;
      vColor = aColor;
      vDistance = distance(aPosition, uCamera);
      gl_Position = uViewProjection * vec4(aPosition, 1.0);
    }
  `;

  const FRAGMENT_SHADER = `
    precision mediump float;
    varying vec4 vColor;
    varying float vLight;
    varying float vDistance;
    uniform vec3 uFogColor;
    void main() {
      float fog = smoothstep(15.0, 34.0, vDistance);
      vec3 lit = vColor.rgb * vLight;
      gl_FragColor = vec4(mix(lit, uFogColor, fog), vColor.a);
    }
  `;

  const COLORS = Object.freeze({
    grass: [0.44, 0.58, 0.29, 1],
    grassDark: [0.35, 0.49, 0.23, 1],
    grid: [0.67, 0.75, 0.46, 1],
    wall: [0.31, 0.43, 0.22, 1],
    wallTop: [0.58, 0.7, 0.36, 1],
    snake: [0.52, 0.7, 0.28, 1],
    snakeAlt: [0.61, 0.78, 0.34, 1],
    fruit: [0.87, 0.2, 0.12, 1],
    fruitLight: [1, 0.36, 0.2, 1],
    leaf: [0.24, 0.48, 0.16, 1],
    marker: [1, 0.74, 0.32, 0.32],
    shrub: [0.24, 0.39, 0.17, 1],
    shrubLight: [0.39, 0.56, 0.23, 1],
    trunk: [0.34, 0.25, 0.14, 1],
  });

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "unknown shader error";
      gl.deleteShader(shader);
      throw new Error(`无法启动 3D 渲染器：${message}`);
    }
    return shader;
  }

  function createProgram(gl) {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "unknown program error";
      gl.deleteProgram(program);
      throw new Error(`无法连接 3D 渲染器：${message}`);
    }
    return program;
  }

  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  }

  function lookAt(out, eye, target, up) {
    let zx = eye[0] - target[0];
    let zy = eye[1] - target[1];
    let zz = eye[2] - target[2];
    let length = Math.hypot(zx, zy, zz) || 1;
    zx /= length;
    zy /= length;
    zz /= length;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    length = Math.hypot(xx, xy, xz) || 1;
    xx /= length;
    xy /= length;
    xz /= length;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    out[0] = xx;
    out[1] = yx;
    out[2] = zx;
    out[3] = 0;
    out[4] = xy;
    out[5] = yy;
    out[6] = zy;
    out[7] = 0;
    out[8] = xz;
    out[9] = yz;
    out[10] = zz;
    out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  }

  function multiply(out, a, b) {
    const result = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        result[column * 4 + row] =
          a[row] * b[column * 4] +
          a[4 + row] * b[column * 4 + 1] +
          a[8 + row] * b[column * 4 + 2] +
          a[12 + row] * b[column * 4 + 3];
      }
    }
    out.set(result);
    return out;
  }

  function pushVertex(vertices, position, normal, color) {
    vertices.push(
      position[0], position[1], position[2],
      normal[0], normal[1], normal[2],
      color[0], color[1], color[2], color[3],
    );
  }

  function addQuad(vertices, a, b, c, d, normal, color) {
    pushVertex(vertices, a, normal, color);
    pushVertex(vertices, b, normal, color);
    pushVertex(vertices, c, normal, color);
    pushVertex(vertices, a, normal, color);
    pushVertex(vertices, c, normal, color);
    pushVertex(vertices, d, normal, color);
  }

  function addBox(vertices, x, y, z, width, height, depth, color, topColor = color) {
    const x0 = x - width / 2;
    const x1 = x + width / 2;
    const y0 = y - height / 2;
    const y1 = y + height / 2;
    const z0 = z - depth / 2;
    const z1 = z + depth / 2;
    addQuad(vertices, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color);
    addQuad(vertices, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color);
    addQuad(vertices, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color);
    addQuad(vertices, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color);
    addQuad(vertices, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], topColor);
    addQuad(vertices, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color);
  }

  function addCylinder(vertices, x, y, z, radius, height, color, sides = 10) {
    const bottom = y - height / 2;
    const top = y + height / 2;
    for (let i = 0; i < sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      const b = ((i + 1) / sides) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const cb = Math.cos(b);
      const sb = Math.sin(b);
      addQuad(
        vertices,
        [x + ca * radius, bottom, z + sa * radius],
        [x + ca * radius, top, z + sa * radius],
        [x + cb * radius, top, z + sb * radius],
        [x + cb * radius, bottom, z + sb * radius],
        [(ca + cb) / 2, 0, (sa + sb) / 2],
        color,
      );
      pushVertex(vertices, [x, top, z], [0, 1, 0], color);
      pushVertex(vertices, [x + cb * radius, top, z + sb * radius], [0, 1, 0], color);
      pushVertex(vertices, [x + ca * radius, top, z + sa * radius], [0, 1, 0], color);
    }
  }

  function addOctahedron(vertices, x, y, z, radius, color, lightColor = color) {
    const top = [x, y + radius, z];
    const bottom = [x, y - radius, z];
    const ring = [
      [x + radius, y, z],
      [x, y, z + radius],
      [x - radius, y, z],
      [x, y, z - radius],
    ];
    for (let i = 0; i < 4; i += 1) {
      const next = ring[(i + 1) % 4];
      const current = ring[i];
      const upperNormal = [current[0] - x + next[0] - x, radius, current[2] - z + next[2] - z];
      const lowerNormal = [current[0] - x + next[0] - x, -radius, current[2] - z + next[2] - z];
      pushVertex(vertices, top, upperNormal, i === 0 ? lightColor : color);
      pushVertex(vertices, next, upperNormal, i === 0 ? lightColor : color);
      pushVertex(vertices, current, upperNormal, i === 0 ? lightColor : color);
      pushVertex(vertices, bottom, lowerNormal, color);
      pushVertex(vertices, current, lowerNormal, color);
      pushVertex(vertices, next, lowerNormal, color);
    }
  }

  function addLeaf(vertices, x, y, z, sway) {
    const tip = [x + 0.42, y + 0.12, z + sway];
    addQuad(
      vertices,
      [x, y, z],
      [x + 0.18, y + 0.07, z + 0.14],
      tip,
      [x + 0.17, y + 0.06, z - 0.13],
      [0, 0.95, 0.2],
      COLORS.leaf,
    );
  }

  function createStaticScene(size) {
    const vertices = [];
    addBox(vertices, size / 2, -0.25, size / 2, size + 6, 0.26, size + 6, COLORS.grassDark);
    addBox(vertices, size / 2, -0.12, size / 2, size, 0.24, size, COLORS.grass, COLORS.grass);
    for (let i = 1; i < size; i += 1) {
      addBox(vertices, i, 0.012, size / 2, 0.025, 0.025, size, COLORS.grid);
      addBox(vertices, size / 2, 0.012, i, size, 0.025, 0.025, COLORS.grid);
    }
    addBox(vertices, -0.18, 0.43, size / 2, 0.36, 0.86, size + 0.72, COLORS.wall, COLORS.wallTop);
    addBox(vertices, size + 0.18, 0.43, size / 2, 0.36, 0.86, size + 0.72, COLORS.wall, COLORS.wallTop);
    addBox(vertices, size / 2, 0.43, -0.18, size, 0.86, 0.36, COLORS.wall, COLORS.wallTop);
    addBox(vertices, size / 2, 0.43, size + 0.18, size, 0.86, 0.36, COLORS.wall, COLORS.wallTop);

    const plants = [
      [-1.1, 2.2, 0.75], [size + 1.1, 4.8, 1.05], [-1.25, 10.5, 1.0],
      [size + 1.3, 14.2, 0.85], [-1.0, 20.5, 1.15], [size + 1.1, 22.0, 0.8],
      [4.0, -1.2, 0.8], [9.0, size + 1.1, 1.1], [16.0, -1.15, 1.0],
      [21.0, size + 1.2, 0.86],
    ];
    for (const [x, z, scale] of plants) {
      addCylinder(vertices, x, 0.28 * scale, z, 0.13 * scale, 0.56 * scale, COLORS.trunk, 7);
      addOctahedron(vertices, x, 0.85 * scale, z, 0.72 * scale, COLORS.shrub, COLORS.shrubLight);
      addOctahedron(vertices, x + 0.35 * scale, 0.66 * scale, z + 0.2 * scale, 0.5 * scale, COLORS.shrub, COLORS.shrubLight);
    }
    return new Float32Array(vertices);
  }

  function create(canvas) {
    let gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      depth: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("当前浏览器不支持 WebGL，无法显示第一人称 3D 画面。");

    let resources = null;
    let contextLost = false;
    let disposed = false;
    let staticScene = null;
    let staticSize = 0;
    let staticUploaded = false;

    function initialize() {
      const program = createProgram(gl);
      const staticBuffer = gl.createBuffer();
      const dynamicBuffer = gl.createBuffer();
      resources = {
        program,
        staticBuffer,
        dynamicBuffer,
        position: gl.getAttribLocation(program, "aPosition"),
        normal: gl.getAttribLocation(program, "aNormal"),
        color: gl.getAttribLocation(program, "aColor"),
        viewProjection: gl.getUniformLocation(program, "uViewProjection"),
        camera: gl.getUniformLocation(program, "uCamera"),
        fogColor: gl.getUniformLocation(program, "uFogColor"),
      };
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      staticUploaded = false;
    }

    function destroyResources() {
      if (!resources || contextLost) return;
      gl.deleteBuffer(resources.staticBuffer);
      gl.deleteBuffer(resources.dynamicBuffer);
      gl.deleteProgram(resources.program);
      resources = null;
    }

    function onContextLost(event) {
      event.preventDefault();
      contextLost = true;
      resources = null;
    }

    canvas.addEventListener("webglcontextlost", onContextLost, false);
    initialize();

    function resize() {
      if (disposed) return false;
      const ratio = Math.min(root.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        return true;
      }
      return false;
    }

    function drawBuffer(buffer, vertices, usage, upload = true) {
      if (!vertices.length) return;
      const data = vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
      const stride = 10 * Float32Array.BYTES_PER_ELEMENT;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (upload) gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      gl.enableVertexAttribArray(resources.position);
      gl.enableVertexAttribArray(resources.normal);
      gl.enableVertexAttribArray(resources.color);
      gl.vertexAttribPointer(resources.position, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(resources.normal, 3, gl.FLOAT, false, stride, 3 * 4);
      gl.vertexAttribPointer(resources.color, 4, gl.FLOAT, false, stride, 6 * 4);
      gl.drawArrays(gl.TRIANGLES, 0, data.length / 10);
    }

    function render(state, camera, time = 0) {
      if (disposed || contextLost || !resources) return false;
      resize();
      const size = state.size || 24;
      if (!staticScene || staticSize !== size) {
        staticScene = createStaticScene(size);
        staticSize = size;
        staticUploaded = false;
      }

      const dynamic = [];
      state.snake.slice(2).forEach((cell, index) => {
        const color = index % 2 ? COLORS.snakeAlt : COLORS.snake;
        addCylinder(dynamic, cell.x + 0.5, 0.36, cell.y + 0.5, 0.38, 0.66, color, 10);
        const next = state.snake[index + 3];
        if (next && Math.abs(cell.x - next.x) + Math.abs(cell.y - next.y) === 1) {
          const horizontal = cell.y === next.y;
          addBox(
            dynamic,
            (cell.x + next.x) / 2 + 0.5,
            0.34,
            (cell.y + next.y) / 2 + 0.5,
            horizontal ? 1 : 0.54,
            0.42,
            horizontal ? 0.54 : 1,
            color,
            color,
          );
        }
      });

      if (state.food) {
        const x = state.food.x + 0.5;
        const z = state.food.y + 0.5;
        const bob = Math.sin(time * 0.0035) * 0.08;
        addBox(dynamic, x, 1.9, z, 0.055, 3.2, 0.055, COLORS.marker);
        addOctahedron(dynamic, x, 0.52 + bob, z, 0.36, COLORS.fruit, COLORS.fruitLight);
        addCylinder(dynamic, x, 0.86 + bob, z, 0.045, 0.22, COLORS.trunk, 6);
        addLeaf(dynamic, x, 0.97 + bob, z, Math.sin(time * 0.002) * 0.04);
      }

      const eye = [camera.x, 0.86, camera.z];
      const forwardX = Math.sin(camera.yaw);
      const forwardZ = -Math.cos(camera.yaw);
      const target = [eye[0] + forwardX, eye[1] - 0.13, eye[2] + forwardZ];
      const view = lookAt(new Float32Array(16), eye, target, [0, 1, 0]);
      const projection = perspective(
        new Float32Array(16),
        (68 * Math.PI) / 180,
        canvas.width / canvas.height,
        0.055,
        48,
      );
      const viewProjection = multiply(new Float32Array(16), projection, view);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.77, 0.85, 0.68, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(resources.program);
      gl.uniformMatrix4fv(resources.viewProjection, false, viewProjection);
      gl.uniform3f(resources.camera, eye[0], eye[1], eye[2]);
      gl.uniform3f(resources.fogColor, 0.77, 0.85, 0.68);
      drawBuffer(resources.staticBuffer, staticScene, gl.STATIC_DRAW, !staticUploaded);
      staticUploaded = true;
      drawBuffer(resources.dynamicBuffer, dynamic, gl.DYNAMIC_DRAW);
      return true;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", onContextLost);
      destroyResources();
      staticScene = null;
    }

    return { render, resize, dispose };
  }

  root.SnakeRenderer = Object.freeze({ create });
})(globalThis);
