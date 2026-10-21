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

const float PI = 3.141592653589793;
const float TMIN = 1e-6;
const float TMAX = 1e20;
const int maxPathLength = 5;

// ====================
// Scene types
// ====================

struct Material {
    vec3 emissive;      // Emitted light colour and intensity.
    vec3 diffuse;       // Base surface colour.
    vec3 specular;      // Colour and strength of the reflected highlight.
    float glossiness;   // Higher values give a narrower reflection lobe.
};

struct Sphere {
    vec3 position;
    float radius;
    Material material;
};

struct Plane {
    vec3 normal;
    float d;           // Plane equation: dot(normal, position) + d = 0.
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

Material paperMaterial(vec3 color) {
    return Material(vec3(0.0), color, vec3(0.0), 1.0);
}

Material lightMaterial(vec3 intensity) {
    return Material(intensity, vec3(0.0), vec3(0.0), 1.0);
}

// ====================
// Utility
// ====================

vec2 getUv() {
    vec2 uv = gl_FragCoord.xy / iResolution;
    float aspect = iResolution.x / iResolution.y;
    vec2 scale = aspect > 1.0 ? vec2(aspect, 1.0) : vec2(1.0, 1.0 / aspect);
    return (uv - 0.5) * scale + 0.5;
}

int randomSeed;

void initRandomSeed() {
    randomSeed = int(gl_FragCoord.x) * 1973 + int(gl_FragCoord.y) * 9277 + int(iTime * 26699.0);
}

float randFloat() {
    // 32 bit LCG. Reference for the multiplier and increment:
    // https://en.wikipedia.org/wiki/Linear_congruential_generator
    randomSeed = randomSeed * 1664525 + 1013904223;
    // Keep 15 bits and map them to the inclusive range [0, 1].
    return float((randomSeed & 0x7FFFFFFF) % 32768) / 32767.0;
}

// ====================
// Geometry intersections
// ====================

HitInfo getEmptyHit() {
    Material material = Material(vec3(0.0), vec3(0.0), vec3(0.0), 0.0);
    return HitInfo(false, 0.0, vec3(0.0), vec3(0.0), material);
}

HitInfo intersectSphere(Ray ray, Sphere sphere) {
    vec3 offset = ray.origin - sphere.position;
    float a = dot(ray.direction, ray.direction);
    float b = 2.0 * dot(ray.direction, offset);
    float c = dot(offset, offset) - sphere.radius * sphere.radius;
    float discriminant = b * b - 4.0 * a * c;
    if (discriminant <= 0.0) return getEmptyHit();

    float t0 = (-b - sqrt(discriminant)) / (2.0 * a);
    float t1 = (-b + sqrt(discriminant)) / (2.0 * a);
    if (t0 > TMAX || t1 < TMIN) return getEmptyHit();

    float t = t0;
    if (t0 < TMIN) t = TMIN;
    if (t1 > TMAX) t = TMAX;

    vec3 position = ray.origin + t * ray.direction;
    vec3 normal = normalize(position - sphere.position);
    if (length(offset) < sphere.radius + 0.001) normal = -normal;
    return HitInfo(true, t, position, normal, sphere.material);
}

HitInfo intersectPlane(Ray ray, Plane plane) {
    float denominator = dot(ray.direction, plane.normal);
    // Nearly parallel rays make the distance calculation unstable.
    if (abs(denominator) < 1e-6) return getEmptyHit();

    float t = -(dot(ray.origin, plane.normal) + plane.d) / denominator;
    if (t < TMIN || t > TMAX) return getEmptyHit();

    vec3 position = ray.origin + t * ray.direction;
    return HitInfo(true, t, position, normalize(plane.normal), plane.material);
}

// ====================
// Scene
// ====================

const int sphereCount = 4;
const int planeCount = 5;
Sphere spheres[sphereCount];
Plane planes[planeCount];

void loadScene() {
    Material orangePlastic = Material(vec3(0.0), vec3(1.0, 0.5, 0.0), vec3(0.5), 50.0);
    Material mirror = Material(vec3(0.0), vec3(0.0), vec3(1.0), 1000.0);
    Material whitePaper = paperMaterial(vec3(0.8));

    spheres[0] = Sphere(vec3(-1.5, 0.5, -7.0), 1.5, orangePlastic);
    spheres[1] = Sphere(vec3(1.5, 0.0, -5.0), 1.0, mirror);
    spheres[2] = Sphere(vec3(2.0, 2.0, -5.0), 0.5, lightMaterial(vec3(3.0, 4.0, 3.5)));
    spheres[3] = Sphere(vec3(-2.5, -0.5, -3.0), 0.15, lightMaterial(vec3(10.0, 8.0, 6.0)));

    planes[0] = Plane(vec3(0.0, 1.0, 0.0), 1.0, whitePaper);
    planes[1] = Plane(vec3(1.0, 0.0, 0.0), 6.0, paperMaterial(vec3(1.0, 0.0, 0.0)));
    planes[2] = Plane(vec3(-1.0, 0.0, 0.0), 6.0, paperMaterial(vec3(0.0, 1.0, 0.0)));
    planes[3] = Plane(vec3(0.0, 0.0, 1.0), 10.0, whitePaper);
    planes[4] = Plane(vec3(0.0, -1.0, 0.0), 5.0, whitePaper);
}

HitInfo intersectScene(Ray ray) {
    HitInfo best = getEmptyHit();
    best.t = TMAX;

    for (int i = 0; i < sphereCount; i++) {
        HitInfo hit = intersectSphere(ray, spheres[i]);
        if (hit.hit && hit.t < best.t) best = hit;
    }

    for (int i = 0; i < planeCount; i++) {
        HitInfo hit = intersectPlane(ray, planes[i]);
        if (hit.hit && hit.t < best.t) best = hit;
    }

    return best;
}

// ====================
// Path tracing
// ====================

mat3 getLocalFrame(vec3 normal) {
    // Switch axes near the poles to keep the cross product stable.
    vec3 axis = abs(normal.y) > 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0);
    vec3 tangent = normalize(cross(normal, axis));
    vec3 bitangent = cross(normal, tangent);
    return mat3(tangent, bitangent, normal);
}

void sampleDirection(vec3 normal, out float probability, out vec3 direction) {
    float sampleRadius = randFloat();
    float sampleAngle = randFloat();
    float cosTheta = sqrt(sampleRadius);
    float sinTheta = sqrt(1.0 - sampleRadius);
    float phi = 2.0 * PI * sampleAngle;

    vec3 localDirection = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
    direction = getLocalFrame(normal) * localDirection;

    // Cosine weighted sampling has density cos(theta) / PI.
    probability = cosTheta / PI;
}

vec3 getReflectance(Material material, vec3 normal, vec3 incoming, vec3 outgoing) {
    // The normal and both directions must be unit vectors.
    vec3 reflected = reflect(-incoming, normal);
    vec3 specular = material.specular;
    specular *= (material.glossiness + 2.0) / (2.0 * PI);
    specular *= pow(max(dot(outgoing, reflected), 0.0), material.glossiness);
    return (material.diffuse + specular) / 2.0;
}

vec3 tracePath(Ray ray) {
    vec3 result = vec3(0.0);
    // Weight carried through earlier bounces.
    vec3 throughput = vec3(1.0);

    for (int i = 0; i < maxPathLength; i++) {
        HitInfo hit = intersectScene(ray);
        if (!hit.hit) break;

        result += throughput * hit.material.emissive;

        Ray outgoing;
        float probability;
        sampleDirection(hit.normal, probability, outgoing.direction);
        outgoing.direction = normalize(outgoing.direction);

        // A small offset reduces false hits on the surface we just left.
        outgoing.origin = hit.position + hit.normal * 1e-5;
        float geometricTerm = max(dot(hit.normal, outgoing.direction), 0.0);
        // The sampling density tends to zero at grazing angles.
        if (geometricTerm < 1e-6) break;

        vec3 reflectance = getReflectance(hit.material, hit.normal, ray.direction, outgoing.direction);
        throughput *= reflectance * geometricTerm;
        throughput /= probability;
        ray = outgoing;
    }

    return result;
}

vec3 rayCast(Ray ray) {
    HitInfo hit = intersectScene(ray);
    if (!hit.hit) return vec3(0.0);
    if (length(hit.material.emissive) > 0.0) return hit.material.emissive;
    return hit.material.diffuse;
}

// ====================
// Camera
// ====================

vec3 rotateByQuaternion(vec3 vector, vec4 rotation) {
    // Quaternion components are stored as (x, y, z, w).
    vec3 offset = 2.0 * cross(rotation.xyz, vector);
    return vector + rotation.w * offset + cross(rotation.xyz, offset);
}

Ray generateCameraRay(vec2 uv) {
    // Jitter the ray within a pixel so accumulated samples smooth the edges.
    uv += vec2(randFloat() - 0.5, randFloat() - 0.5) / iResolution;
    vec3 localDirection = normalize(vec3(uv * 2.0 - 1.0, -1.5));
    vec3 direction = rotateByQuaternion(localDirection, iCamRotation);
    return Ray(iCamPosition, normalize(direction));
}

// ====================
// Main
// ====================

void main() {
    initRandomSeed();
    loadScene();

    Ray ray = generateCameraRay(getUv());
    vec3 sampleColor = iPathTrace ? tracePath(ray) : rayCast(ray);
    vec3 previous = texture(iPrevAcc, gl_FragCoord.xy / iResolution).rgb;
    // A zero frame index discards samples from the previous view.
    vec3 average = (previous * float(iFrameIndex) + sampleColor) / (float(iFrameIndex) + 1.0);
    outColor = vec4(average, 1.0);
}
