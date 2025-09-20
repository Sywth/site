#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;

uniform vec4 iCamRotation; 
uniform vec3 iCamPosition;

uniform sampler2D iPrevAcc;
uniform int iFrameIndex;

uniform bool iPathTrace; 

out vec4 outColor;

#define M_PI 3.141592653589793
const float TMIN = 1e-6;
const float TMAX = 1e20;

// -------------------- Scene Structs --------------------
struct Material {
    vec3 lightIntensity;
    vec3 diffuse;
    vec3 specular;
    float glossiness;
};

struct Sphere {
    vec3 position;
    float radius;
    Material material;
};

struct Plane {
    vec3 normal;
    float d;
    Material material;
};

struct Ray {
    vec3 origin;
    vec3 direction;
};

struct HitInfo {
    bool hit;
    float t;
    vec3 position;
    vec3 normal;
    Material material;
};

Plane NewWall(vec3 normal, float d, Material material) {
    Plane p;
    p.normal = normal;
    p.d = d;
    p.material = material;
    return p;
}

Material NewPaper(vec3 color) {
    Material m;
    m.lightIntensity = vec3(0.0);
    m.diffuse = color;
    m.specular = vec3(0.0);
    m.glossiness = 1.0;
    return m;
}

Material NewLight(vec3 intensity) {
    Material m;
    m.lightIntensity = intensity;
    m.diffuse = vec3(0.0);
    m.specular = vec3(0.0);
    m.glossiness = 1.0;
    return m;
}

Material NewOrangePlastic() {
    Material m;
    m.lightIntensity = vec3(0.0);
    m.diffuse = vec3(1.0, 0.5, 0.0);
    m.specular = vec3(0.5);
    m.glossiness = 50.0;
    return m;
}

Material NewMirror() {
    Material m;
    m.lightIntensity = vec3(0.0);
    m.diffuse = vec3(0.0);
    m.specular = vec3(1.0);
    m.glossiness = 1000.0;
    return m;
}

// -------------------- Utility --------------------
vec2 getUv() {
    vec2 uv = (gl_FragCoord.xy / iResolution);
    float aspect = iResolution.x / iResolution.y;
    if (aspect > 1.0) {
        uv = (uv - 0.5) * vec2(aspect, 1.0) + 0.5;
    } else {
        uv = (uv - 0.5) * vec2(1.0, 1.0 / aspect) + 0.5;
    }
    return uv;
}

// Random number generator 
const int maxSignedShort = 32767;
int randomSeed;

void initRandomSeed() {
    randomSeed = int(gl_FragCoord.x) * 1973 + int(gl_FragCoord.y) * 9277 + int(iTime * 26699.0);
}

void cycleRandomSeed() {
    // 32-bit LCG with good constants 
    //  src : https://en.wikipedia.org/wiki/Linear_congruential_generator
    randomSeed = randomSeed * 1664525 + 1013904223;
}

int randInt() {
    cycleRandomSeed();
    // scale down to [0, maxSignedShort]
    return (randomSeed & 0x7FFFFFFF) % (maxSignedShort + 1);
}

float randFloat() {
    return float(randInt()) / float(maxSignedShort);
}


// -------------------- Geometry Intersections --------------------
HitInfo getEmptyHit() {
    Material m;
    m.lightIntensity = vec3(0.0);
    m.diffuse = vec3(0.0);
    m.specular = vec3(0.0);
    m.glossiness = 0.0;
    return HitInfo(false, 0.0, vec3(0.0), vec3(0.0), m);
}

void sortT(inout float t0, inout float t1) {
    if (t0 > t1) {
        float temp = t0;
        t0 = t1;
        t1 = temp;
    }
}


HitInfo intersectSphere(const Ray ray, const Sphere sphere, const float tMin, const float tMax) {
    vec3 to_sphere = ray.origin - sphere.position;
  
    float a = dot(ray.direction, ray.direction);
    float b = 2.0 * dot(ray.direction, to_sphere);
    float c = dot(to_sphere, to_sphere) - sphere.radius * sphere.radius;
    float D = b * b - 4.0 * a * c;

    if (D <= 0.0) return getEmptyHit();

    float t0 = (-b - sqrt(D)) / (2.0 * a);
    float t1 = (-b + sqrt(D)) / (2.0 * a);
    sortT(t0, t1);
    float t = t0; // Try to use smaller t first

    if (t0 > tMax || t1 < tMin) return getEmptyHit();
    if (t0 < tMin) t = tMin;
    if (t1 > tMax) t = tMax;

    vec3 hitPosition = ray.origin + t * ray.direction;

    vec3 normal = 
        length(ray.origin - sphere.position) < sphere.radius + 0.001? 
        -normalize(hitPosition - sphere.position) : 
        normalize(hitPosition - sphere.position);      

    return HitInfo(
        true,
        t,
        hitPosition,
        normal,
        sphere.material
    );
}

HitInfo intersectPlane(Ray ray, Plane p, float tMin, float tMax) {
    float denom = dot(ray.direction, p.normal);
    if (abs(denom) < 1e-6) return getEmptyHit();
    float t = -(dot(ray.origin, p.normal) + p.d) / denom;
    if (t < tMin || t > tMax) return getEmptyHit();
    vec3 pos = ray.origin + t * ray.direction;
    return HitInfo(true, t, pos, normalize(p.normal), p.material);
}

// -------------------- Scene --------------------
const int sphereCount = 4;
const int planeCount = 5;
Sphere spheres[sphereCount];
Plane planes[planeCount];

void loadScene() {
    spheres[0].position = vec3(-1.5, 0.5, -7.0);
    spheres[0].radius = 1.5;
    spheres[0].material = NewOrangePlastic();

    spheres[1].position = vec3(1.5, 0.0, -5.0);
    spheres[1].radius = 1.0;
    spheres[1].material = NewMirror();

    spheres[2].position = vec3(2.0, 2.0, -5.0);
    spheres[2].radius = 0.5;
    spheres[2].material = NewLight(vec3(3.0, 4.0, 3.5));

    spheres[3].position = vec3(-2.5, -0.5, -3.0);
    spheres[3].radius = 0.15;
    spheres[3].material = NewLight(vec3(10.0, 8.0, 6.0));

    // Cornell Box
    // celling 
    planes[0].normal = vec3(0.0, 1.0, 0.0);
    planes[0].d = 1.0;
    planes[0].material.lightIntensity = vec3(0.0);
    planes[0].material.diffuse = vec3(0.8);
    planes[0].material.specular = vec3(0.0);
    planes[0].material.glossiness = 1.0;

    // left wall
    planes[1].normal = vec3(1.0, 0.0, 0.0);
    planes[1].d = 6.0;
    planes[1].material.lightIntensity = vec3(0.0);
    planes[1].material.diffuse = vec3(1.0, 0.0, 0.0);
    planes[1].material.specular = vec3(0.0);
    planes[1].material.glossiness = 1.0;

    // right wall
    planes[2].normal = vec3(-1.0, 0.0, 0.0);
    planes[2].d = 6.0;
    planes[2].material.lightIntensity = vec3(0.0);
    planes[2].material.diffuse = vec3(0.0, 1.0, 0.0);
    planes[2].material.specular = vec3(0.0);
    planes[2].material.glossiness = 1.0;

    // back wall
    planes[3].normal = vec3(0.0, 0.0, 1.0);
    planes[3].d = 10.0; 
    planes[3].material.lightIntensity = vec3(0.0);
    planes[3].material.diffuse = vec3(0.8);
    planes[3].material.specular = vec3(0.0);
    planes[3].material.glossiness = 1.0;

    // floor
    planes[4].normal = vec3(0.0, -1.0, 0.0);
    planes[4].d = 5.0;
    planes[4].material.lightIntensity = vec3(0.0);
    planes[4].material.diffuse = vec3(0.8);
    planes[4].material.specular = vec3(0.0);
    planes[4].material.glossiness = 1.0;
}

HitInfo intersectScene(Ray ray) {
    HitInfo best = getEmptyHit();
    best.t = 1e20;
    for (int i = 0; i < sphereCount; i++) {
        HitInfo h = intersectSphere(ray, spheres[i], TMIN, TMAX);
        if (h.hit && h.t < best.t) best = h;
    }
    for (int i = 0; i < planeCount; i++) {
        HitInfo h = intersectPlane(ray, planes[i], TMIN, TMAX);
        if (h.hit && h.t < best.t) best = h;
    }
    return best;
}

// -------------------- Path Tracing --------------------
// Assumes n is normalized
vec3 randomHemisphere(vec3 n) {
    float u = randFloat();
    float v = randFloat();

    float theta = acos(sqrt(1.0 - u));
    float phi = 2.0 * M_PI * v;
    
    vec3 d = vec3(sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta));

    // build basis (use y+ unless its too similar to n)
    vec3 up = abs(n.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0);
    vec3 tangent = normalize(cross(up, n));
    vec3 bitangent = cross(n, tangent);
    return normalize(tangent * d.x + bitangent * d.y + n * d.z);
}

// TODO : Review this and add specular/glossy support
vec3 tracePath(Ray ray) {
    vec3 throughput = vec3(1.0);
    vec3 radiance = vec3(0.0);
    for (int bounce = 0; bounce < 3; bounce++) {
        HitInfo h = intersectScene(ray);
        if (!h.hit) break;
        if (length(h.material.lightIntensity) > 0.0) {
            radiance += throughput * h.material.lightIntensity;
            break;
        }
        vec3 nextDir = randomHemisphere(h.normal);
        throughput *= h.material.diffuse;
        ray.origin = h.position + 0.001 * h.normal;
        ray.direction = nextDir;
    }
    return radiance;
}

// Simple ray caster the main path tracer 
vec3 rayCast(Ray ray) {
    HitInfo h = intersectScene(ray);
    if (!h.hit) return vec3(0.0);
    if (length(h.material.lightIntensity) > 0.0) {
        return h.material.lightIntensity;
    }
    return h.material.diffuse;
}

// -------------------- Camera --------------------
// Rotates a vector by a quaternion
vec3 rotateByQuaternion(vec3 v, vec4 q) {
    // q = (x, y, z, w)
    vec3 t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}

Ray generateCameraRay(vec2 uv, vec3 cameraPos, vec4 cameraRot) {
    vec3 localOrigin = vec3(0.0, 0.0, 0.0);
    vec3 localDir = normalize(vec3(uv * 2.0 - 1.0, -1.5));
    vec3 worldOrigin = cameraPos + rotateByQuaternion(localOrigin, cameraRot);
    vec3 worldDir = rotateByQuaternion(localDir, cameraRot);
    return Ray(worldOrigin, normalize(worldDir));
}

// -------------------- Main --------------------
void main() {
    initRandomSeed();

    loadScene();
    vec2 uv = getUv();
    Ray camRay = generateCameraRay(uv, iCamPosition, iCamRotation);
    vec3 currSample;
    if (iPathTrace) {
        currSample = tracePath(camRay);
    } else {
        currSample = rayCast(camRay);
    }

    // On the first frame we just * 0 hence no prevSample contribution
    vec3 prevSample = texture(iPrevAcc, gl_FragCoord.xy / iResolution.xy).rgb;
    vec3 newAverage = (prevSample * float(iFrameIndex) + currSample) / (float(iFrameIndex) + 1.0);
    outColor = vec4(newAverage, 1.0);
}
