/* Original, procedural light renderer. No light-effect textures. */
function createInteriorLamp() {
  const canvas = document.createElement('canvas');
  canvas.width = 660;
  canvas.height = 1200;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
  });
  if (!gl) return null;
  const vertex = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;
  const fragment = `precision highp float;
uniform vec2 resolution;uniform float clock;uniform float age;uniform float gold;uniform float power;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
void main(){
 vec2 uv=vec2(gl_FragCoord.x,resolution.y-gl_FragCoord.y)/resolution;
 vec2 p=(uv-vec2(.515,.344))*vec2(1.,1.81818);
 float h=-p.y;float aligned=p.y+.12*p.x;
 float drift=noise(vec2(p.x*9.,p.y*7.-clock*.13));
 // Broad rectangular emitter fills the opening; it is not a point spotlight.
 float interior=exp(-pow(abs(p.x/.255),6.)-pow(abs(aligned/.07),2.))*4.;
 float softness=exp(-pow(abs(p.x/.29),2.)-pow(abs(aligned/.16),2.))*.8;
 float warmth=exp(-pow(abs(p.x/.36),2.)-pow(abs(aligned/.25),2.))*.2;
 float above=smoothstep(-.035,.06,h);
 float spread=.25+max(h,0.)*.42;
 float haze=exp(-pow(abs(p.x/spread),2.))*exp(-max(h,0.)*8.)*above*(.22+drift*.18);
 float theta=atan(p.x,max(h,.02));
 float rays=pow(max(0.,sin(theta*13.+clock*.035)),3.)*haze*.13;
 if(gold>=-.5)rays=0.;
 vec3 tint=gold<-1.5?vec3(.94,.96,1.):gold<-.5?vec3(1.,.91,.74):(gold>.5?vec3(1.,.83,.53):vec3(.66,.36,1.));
 vec3 white=vec3(1.,.99,.955);
 float bloom=gold>.5?1.12:1.;
 vec3 energy=white*(interior+softness*.55)+tint*(warmth+haze+rays)*bloom;
 // One continuous diffusing volume. No beam, spoke or angular stripe fields.
 if(gold>=-.5){
  float release=smoothstep(.015,.15,age);
  float spreading=smoothstep(.02,.42,age);
  float radius=.23+spreading*.42;
  float center=.035+spreading*.23;
  float softnessY=.10+spreading*.26;
  float mistNoise=noise(vec2(p.x*5.,h*4.-clock*.16));
  float cloud=exp(-pow(abs(p.x/radius),2.)-pow(abs((h-center)/softnessY),2.));
  float fringe=exp(-pow(abs(p.x/(radius*1.22)),2.)-pow(abs((h-center)/(softnessY*1.25)),2.));
  float pulse=1.-smoothstep(.28,1.1,age);
  float field=cloud*above*release*(.85+.15*mistNoise);
  float strength=(gold>.5?1.5:1.18)*(1.+.20*(1.-smoothstep(.18,.7,age)));
  energy+=strength*(white*field*(.65+pulse*1.25)+tint*fringe*above*release*(gold>.5?(.25+pulse*.4):(.75+pulse*.65)));
 }
 float breath=1.+.015*sin(clock*1.4);energy*=power*breath;
 vec3 color=1.-exp(-energy*1.25);float intensity=max(max(color.r,color.g),color.b);float a=clamp(intensity*1.3,0.,.985);
 // Keep translucent light luminous instead of darkening a cream backdrop.
 if(gold>=-.5||gold<-1.5)color/=max(intensity,.0001);
 // The diffuse volume must reach zero before the finite canvas boundary.
 float edge=smoothstep(.015,.20,uv.x)*smoothstep(.015,.20,1.-uv.x)
           *smoothstep(.015,.22,uv.y)*smoothstep(.015,.16,1.-uv.y);
 a*=edge;
 if(a<.001)gl_FragColor=vec4(0.);else gl_FragColor=vec4(color,a);
}
`;
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  try {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    let a = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    ['resolution', 'clock', 'age', 'gold', 'power'].forEach(
      (n) => (u[n] = gl.getUniformLocation(prog, n)),
    );
    return {
      dispose() {
        gl.deleteProgram(prog);
        gl.deleteBuffer(buf);
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      },
      canvas,
      fragment,
      render(t, age, gold, power) {
        gl.viewport(0, 0, 660, 1200);
        gl.uniform2f(u.resolution, 660, 1200);
        gl.uniform1f(u.clock, t);
        gl.uniform1f(u.age, age);
        gl.uniform1f(u.gold, gold);
        gl.uniform1f(u.power, power);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
    };
  } catch (e) {
    console.warn('Procedural light fallback active', e);
    return null;
  }
}
