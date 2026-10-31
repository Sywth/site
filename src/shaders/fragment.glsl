#version 300 es
precision highp float;
precision highp int;

uniform vec2 iResolution;
uniform vec4 iCamRotation;
uniform vec3 iCamPosition;
uniform vec3 iRoomMin;
uniform vec2 iRoomMax;
uniform highp sampler2D iPrevAcc;
uniform int iFrameIndex;
uniform bool iPathTrace;

out vec4 outColor;

const float PI = 3.141592653589793;
const float TMIN = 1e-6;
const float TMAX = 1e20;
const int maxPathLength = 12;

const int paperWhite = 0;
const int paperRed = 1;
const int paperGreen = 2;
const int paperBlue = 3;
const int plasticOrange = 4;
const int lightCeiling = 5;
const int lightWarm = 10;
const int glass = 6;
const int metal = 7;
const int checkeredFloor = 8;
const int mirror = 9;

// ====================
// Scene types
// ====================

struct Material {
    vec3 emissive;      // Emitted light colour and intensity.
    vec3 diffuse;       // Base surface colour.
    vec3 specular;      // Colour and strength of the reflected highlight.
    float glossiness;   // Higher values give a narrower reflection lobe.
    float ior;
};

struct Sphere {
    vec3 position;
    float radius;
    int materialId;
};

struct Cylinder {
    vec3 position;
    vec3 axis;
    float radius;
    int materialId;
};

struct Plane {
    vec3 normal;
    float d;           // Plane equation: dot(normal, position) + d = 0.
    int materialId;
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
    bool frontFace;
};

Material paperMaterial(vec3 color) {
    return Material(vec3(0.0), color, vec3(0.0), 1.0, 0.0);
}

Material lightMaterial(vec3 intensity) {
    return Material(intensity, vec3(0.0), vec3(0.0), 1.0, 0.0);
}

Material checkeredPattern(vec3 position, Material material) {
    float tile = mod(floor(position.x) + floor(position.z), 2.0);
    material.diffuse *= mix(1.0, 0.125, tile);
    return material;
}

Material getMaterial(int materialId, vec3 position) {
    switch (materialId) {
        case paperRed:
            return paperMaterial(vec3(1.0, 0.0, 0.0));
        case paperGreen:
            return paperMaterial(vec3(0.0, 1.0, 0.0));
        case paperBlue:
            return paperMaterial(vec3(0.0, 0.0, 1.0));
        case plasticOrange:
            return Material(vec3(0.0), vec3(1.0, 0.5, 0.0), vec3(0.5), 50.0, 0.0);
        case lightCeiling:
            return lightMaterial(vec3(3.0, 4.0, 3.5));
        case lightWarm:
            return lightMaterial(vec3(10.0, 8.0, 6.0));
        case glass:
            return Material(vec3(0.0), vec3(0.0), vec3(1.0), 0.0, 1.5);
        case metal:
            return Material(vec3(0.0), vec3(0.0), vec3(0.9, 0.92, 0.95), 1000.0, 0.0);
        case checkeredFloor:
            return checkeredPattern(position, paperMaterial(vec3(0.8)));
        case mirror:
            return Material(vec3(0.0), vec3(0.0), vec3(1.0), 1000.0, 0.0);
        default:
            return paperMaterial(vec3(0.8));
    }
}

// ====================
// Scene
// ====================

const int sphereCount = 4;
const int cylinderCount = 4;
const int planeCount = 5;
const int lightCount = 2;
const int lightIndices[lightCount] = int[lightCount](2, 3);
Sphere spheres[sphereCount];
Plane planes[planeCount];
Cylinder cylinders[cylinderCount];

void loadScene() {
    spheres[0] = Sphere(vec3(-1.5, 0.5, -7.0), 1.5, plasticOrange);
    spheres[1] = Sphere(vec3(1.5, 0.0, -5.0), 1.0, mirror);
    spheres[2] = Sphere(vec3(2.0, 2.0, -5.0), 0.5, lightCeiling);
    spheres[3] = Sphere(vec3(-2.5, -0.5, -3.0), 0.15, lightWarm);

    vec3 cylinderPosition = vec3(3.5, 2.0, -5.0);
    vec3 cylinderAxis = normalize(vec3(0.4, -1.0, -0.4));
    float cylinderOffsetScalar = 0.2;

    cylinders[0] = Cylinder(cylinderPosition, cylinderAxis, 0.6, glass);
    cylinders[1] = Cylinder(cylinderPosition + vec3(1,0,0) * cylinderOffsetScalar, cylinderAxis, 0.04, paperRed);
    cylinders[2] = Cylinder(cylinderPosition, cylinderAxis, 0.04, paperGreen);
    cylinders[3] = Cylinder(cylinderPosition, cylinderAxis, 0.04, paperBlue);

    cylinders[1].position += vec3( 1, 0, 0) * cylinderOffsetScalar;
    cylinders[2].position += vec3(-1,-1,-1) * cylinderOffsetScalar;
    cylinders[3].position += vec3( 0, 0, 1) * cylinderOffsetScalar;

    planes[0] = Plane(vec3( 0.0,  1.0, 0.0), -iRoomMin.y, checkeredFloor);
    planes[1] = Plane(vec3( 1.0,  0.0, 0.0), -iRoomMin.x, paperRed);
    planes[2] = Plane(vec3(-1.0,  0.0, 0.0), iRoomMax.x, paperGreen);
    planes[3] = Plane(vec3( 0.0,  0.0, 1.0), -iRoomMin.z, paperWhite);
    planes[4] = Plane(vec3( 0.0, -1.0, 0.0), iRoomMax.y, paperWhite);
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

uint randomSeed;

void initRandomSeed() {
    randomSeed = uint(gl_FragCoord.x) + uint(gl_FragCoord.y) * uint(iResolution.x)
        + uint(iFrameIndex) * 747796405u;
}

float randFloat() {
    // pcg mixes the seed bits to reduce visible patterns
    // https://en.wikipedia.org/wiki/Permuted_congruential_generator
    randomSeed = randomSeed * 747796405u + 2891336453u;
    uint word = ((randomSeed >> ((randomSeed >> 28u) + 4u)) ^ randomSeed) * 277803737u;
    return float(((word >> 22u) ^ word) >> 8u) / 16777216.0;
}

// ====================
// Geometry intersections
// ====================

HitInfo getEmptyHit() {
    Material material = Material(vec3(0.0), vec3(0.0), vec3(0.0), 0.0, 0.0);
    return HitInfo(false, 0.0, vec3(0.0), vec3(0.0), material, false);
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

    // use near hit or the exit hit if the ray starts inside
    float t = t0 >= TMIN ? t0 : t1;
    if (t < TMIN || t > TMAX) return getEmptyHit();

    vec3 position = ray.origin + t * ray.direction;
    vec3 normal = normalize(position - sphere.position);
    bool frontFace = dot(normal, ray.direction) < 0.0;
    if (!frontFace) normal = -normal;
    return HitInfo(true, t, position, normal, getMaterial(sphere.materialId, position), frontFace);
}

HitInfo intersectCylinder(Ray ray, Cylinder cylinder) {
    vec3 offset = ray.origin - cylinder.position;
    vec3 radialOffset = offset - cylinder.axis * dot(offset, cylinder.axis);
    vec3 radialDirection = ray.direction - cylinder.axis * dot(ray.direction, cylinder.axis);
    float a = dot(radialDirection, radialDirection);
    if (a < 1e-12) return getEmptyHit();

    float b = 2.0 * dot(radialDirection, radialOffset);
    float c = dot(radialOffset, radialOffset) - cylinder.radius * cylinder.radius;
    float discriminant = b * b - 4.0 * a * c;
    if (discriminant <= 0.0) return getEmptyHit();

    float root = sqrt(discriminant);
    float t0 = (-b - root) / (2.0 * a);
    float t1 = (-b + root) / (2.0 * a);
    float t = t0 >= TMIN ? t0 : t1;
    if (t < TMIN || t > TMAX) return getEmptyHit();

    vec3 position = ray.origin + t * ray.direction;
    vec3 surfaceOffset = position - cylinder.position;
    vec3 normal = normalize(surfaceOffset - cylinder.axis * dot(surfaceOffset, cylinder.axis));
    bool frontFace = dot(normal, ray.direction) < 0.0;
    if (!frontFace) normal = -normal;
    return HitInfo(true, t, position, normal, getMaterial(cylinder.materialId, position), frontFace);
}

HitInfo intersectPlane(Ray ray, Plane plane) {
    float denominator = dot(ray.direction, plane.normal);
    // Nearly parallel rays make the distance calculation unstable.
    if (abs(denominator) < 1e-6) return getEmptyHit();

    float t = -(dot(ray.origin, plane.normal) + plane.d) / denominator;
    if (t < TMIN || t > TMAX) return getEmptyHit();

    vec3 position = ray.origin + t * ray.direction;
    return HitInfo(true, t, position, normalize(plane.normal), getMaterial(plane.materialId, position), true);
}

// add extra AO to path tracer on walls
float extraWallAmbientOcclusion(vec3 position, vec3 normal, float ao_strength) {
    float edgeDistance = TMAX;
    for (int i = 0; i < planeCount; i++) {
        if (abs(dot(normal, planes[i].normal)) > 0.5) continue;
        float distance = abs(dot(planes[i].normal, position) + planes[i].d);
        edgeDistance = min(edgeDistance, distance);
    }
    return mix(1.0 - ao_strength, 1.0, smoothstep(0.0, 0.5, edgeDistance));
}

HitInfo intersectScene(Ray ray) {
    HitInfo best = getEmptyHit();
    best.t = TMAX;

    for (int i = 0; i < sphereCount; i++) {
        HitInfo hit = intersectSphere(ray, spheres[i]);
        if (hit.hit && hit.t < best.t) best = hit;
    }

    for (int i = 0; i < cylinderCount; i++) {
        HitInfo hit = intersectCylinder(ray, cylinders[i]);
        if (hit.hit && hit.t < best.t) best = hit;
    }

    for (int i = 0; i < planeCount; i++) {
        HitInfo hit = intersectPlane(ray, planes[i]);
        if (!hit.hit || hit.t >= best.t) continue;
        best = hit;
        best.material.diffuse *= extraWallAmbientOcclusion(hit.position, hit.normal, 0.3);
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
    vec3 reflected = reflect(incoming, normal);
    vec3 specular = material.specular;
    specular *= (material.glossiness + 2.0) / (2.0 * PI);
    specular *= pow(max(dot(outgoing, reflected), 0.0), material.glossiness);
    return material.diffuse * (vec3(1.0) - material.specular) / PI + specular;
}

vec3 sampleDirectLight(HitInfo hit, vec3 incoming) {
    Sphere light = spheres[lightIndices[int(randFloat() * float(lightCount))]];
    vec3 origin = hit.position + hit.normal * 1e-5;
    vec3 toLight = light.position - origin;
    float sinThetaMaxSquared = min(light.radius * light.radius / dot(toLight, toLight), 1.0);
    float coneWidth = sinThetaMaxSquared / (1.0 + sqrt(1.0 - sinThetaMaxSquared));
    float cosTheta = 1.0 - randFloat() * coneWidth;
    float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    float phi = 2.0 * PI * randFloat();
    vec3 direction = normalize(getLocalFrame(normalize(toLight))
        * vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta));
    float cosine = max(dot(hit.normal, direction), 0.0);
    if (cosine == 0.0) return vec3(0.0);

    Ray shadowRay = Ray(origin, direction);
    HitInfo lightHit = intersectSphere(shadowRay, light);
    if (!lightHit.hit) return vec3(0.0);
    if (intersectScene(shadowRay).t < lightHit.t) return vec3(0.0);

    float probability = 1.0 / (float(lightCount) * 2.0 * PI * coneWidth);
    return getReflectance(hit.material, hit.normal, incoming, direction)
        * lightHit.material.emissive * cosine / probability;
}

Ray sampleGlassRay(Ray ray, HitInfo hit, inout vec3 throughput) {
    float eta = hit.frontFace ? 1.0 / hit.material.ior : hit.material.ior;
    float cosIncident = clamp(dot(-ray.direction, hit.normal), 0.0, 1.0);
    float sinTransmittedSquared = eta * eta * (1.0 - cosIncident * cosIncident);
    float fresnel = 1.0;
    if (sinTransmittedSquared < 1.0) {
        float cosTransmitted = sqrt(1.0 - sinTransmittedSquared);
        float perpendicular = (eta * cosIncident - cosTransmitted)
            / (eta * cosIncident + cosTransmitted);
        float parallel = (cosIncident - eta * cosTransmitted)
            / (cosIncident + eta * cosTransmitted);
        fresnel = 0.5 * (perpendicular * perpendicular + parallel * parallel);
    }

    vec3 direction = reflect(ray.direction, hit.normal);
    if (randFloat() >= fresnel) {
        direction = refract(ray.direction, hit.normal, eta);
        throughput *= eta * eta;
    }
    float offset = dot(direction, hit.normal) > 0.0 ? 1e-5 : -1e-5;
    return Ray(hit.position + hit.normal * offset, normalize(direction));
}

vec3 tracePath(Ray ray) {
    vec3 result = vec3(0.0);
    // Weight carried through earlier bounces.
    vec3 throughput = vec3(1.0);
    bool specularBounce = true;

    for (int i = 0; i < maxPathLength; i++) {
        HitInfo hit = intersectScene(ray);
        if (!hit.hit) break;

        if (any(greaterThan(hit.material.emissive, vec3(0.0)))) {
            if (specularBounce) result += throughput * hit.material.emissive;
            break;
        }
        if (i == maxPathLength - 1) break;

        if (hit.material.ior > 0.0) {
            ray = sampleGlassRay(ray, hit, throughput);
            specularBounce = true;
            continue;
        }

        vec3 origin = hit.position + hit.normal * 1e-5;
        specularBounce = all(equal(hit.material.diffuse, vec3(0.0)));
        if (specularBounce) {
            throughput *= hit.material.specular;
            ray = Ray(origin, reflect(ray.direction, hit.normal));
            continue;
        }

        result += throughput * sampleDirectLight(hit, ray.direction);

        Ray outgoing;
        float probability;
        sampleDirection(hit.normal, probability, outgoing.direction);
        outgoing.direction = normalize(outgoing.direction);

        // A small offset reduces false hits on the surface we just left.
        outgoing.origin = origin;
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
    uv += vec2(randFloat() - 0.5, randFloat() - 0.5) / min(iResolution.x, iResolution.y);
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
    vec4 previous = texture(iPrevAcc, gl_FragCoord.xy / iResolution);

    // A zero frame index discards samples from the previous view.
    vec3 average = (previous.rgb * float(iFrameIndex) + sampleColor) / (float(iFrameIndex) + 1.0);

    // welford's variance sum uses the spare alpha channel.
    vec3 luminance = vec3(0.2126, 0.7152, 0.0722);
    float variance = iFrameIndex == 0 ? 0.0 : previous.a
        + dot(sampleColor - previous.rgb, luminance) * dot(sampleColor - average, luminance);
    outColor = vec4(average, max(variance, 0.0));
}
