#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;

uniform vec4 iCamRotation; 
uniform vec3 iCamPosition;

out vec4 outColor;

#define M_PI 3.141592653589793

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

HitInfo intersectSphere(Ray ray, Sphere s, float tMin, float tMax) {
    vec3 oc = ray.origin - s.position;
    float a = dot(ray.direction, ray.direction);
    float b = 2.0 * dot(oc, ray.direction);
    float c = dot(oc, oc) - s.radius * s.radius;
    float D = b * b - 4.0 * a * c;
    if (D < 0.0) return getEmptyHit();
    float t0 = (-b - sqrt(D)) / (2.0 * a);
    float t1 = (-b + sqrt(D)) / (2.0 * a);
    if (t0 > t1) { float tmp = t0; t0 = t1; t1 = tmp; }
    float t = (t0 > tMin) ? t0 : t1;
    if (t < tMin || t > tMax) return getEmptyHit();
    vec3 pos = ray.origin + t * ray.direction;
    vec3 nrm = normalize(pos - s.position);
    return HitInfo(true, t, pos, nrm, s.material);
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
const int planeCount = 1;
Sphere spheres[sphereCount];
Plane planes[planeCount];

void loadScene() {
    spheres[0].position = vec3(-1.5, 0.5, -7.0);
    spheres[0].radius = 1.5;
    spheres[0].material.lightIntensity = vec3(0.0);
    spheres[0].material.diffuse = vec3(0.7, 0.2, 0.2);
    spheres[0].material.specular = vec3(0.3);
    spheres[0].material.glossiness = 10.0;

    spheres[1].position = vec3(1.5, 0.0, -5.0);
    spheres[1].radius = 1.0;
    spheres[1].material.lightIntensity = vec3(0.0);
    spheres[1].material.diffuse = vec3(0.2, 0.7, 0.2);
    spheres[1].material.specular = vec3(0.3);
    spheres[1].material.glossiness = 10.0;

    spheres[2].position = vec3(2.0, 2.0, -5.0);
    spheres[2].radius = 0.5;
    spheres[2].material.lightIntensity = vec3(1.0, 0.5, 1.0);
    spheres[2].material.diffuse = vec3(0.0);
    spheres[2].material.specular = vec3(0.0);
    spheres[2].material.glossiness = 1.0;

    spheres[3].position = vec3(-2.5, -0.5, -3.0);
    spheres[3].radius = 0.15;
    spheres[3].material.lightIntensity = vec3(0.5, 1.0, 0.5);
    spheres[3].material.diffuse = vec3(0.0);
    spheres[3].material.specular = vec3(0.0);
    spheres[3].material.glossiness = 1.0;

    planes[0].normal = vec3(0.0, 1.0, 0.0);
    planes[0].d = 1.0;
    planes[0].material.lightIntensity = vec3(0.0);
    planes[0].material.diffuse = vec3(0.8);
    planes[0].material.specular = vec3(0.0);
    planes[0].material.glossiness = 1.0;
}

HitInfo intersectScene(Ray ray) {
    HitInfo best = getEmptyHit();
    best.t = 1e20;
    for (int i = 0; i < sphereCount; i++) {
        HitInfo h = intersectSphere(ray, spheres[i], 0.001, 1e20);
        if (h.hit && h.t < best.t) best = h;
    }
    for (int i = 0; i < planeCount; i++) {
        HitInfo h = intersectPlane(ray, planes[i], 0.001, 1e20);
        if (h.hit && h.t < best.t) best = h;
    }
    return best;
}

// -------------------- Path Tracing --------------------
vec3 randomHemisphere(vec3 n) {
    float u = randFloat();
    float v = randFloat();
    float theta = acos(sqrt(1.0 - u));
    float phi = 2.0 * M_PI * v;
    vec3 d = vec3(sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta));
    // build basis
    vec3 up = abs(n.y) < 0.999 ? vec3(0,1,0) : vec3(1,0,0);
    vec3 tangent = normalize(cross(up, n));
    vec3 bitangent = cross(n, tangent);
    return normalize(tangent * d.x + bitangent * d.y + n * d.z);
}

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
    vec3 col = tracePath(camRay);
    outColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
}
