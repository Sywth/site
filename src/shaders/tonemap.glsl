#version 300 es

#define USE_ACES
precision highp float;

out vec4 fragColor;

uniform sampler2D iScene;
uniform vec2 iResolution;
uniform float iGamma;
uniform float iExposure;

vec3 RRTAndODT_Fit(vec3 v) {
    vec3 a = v * (2.51 * v + 0.03);
    vec3 b = v * (2.43 * v + 0.59) + 0.14;
    return clamp(a / b, 0.0, 1.0);
}

void main() {    
    vec2 uv = gl_FragCoord.xy / iResolution.xy;

    vec3 hdr = texture(iScene, uv).rgb;

    // exposure tone mapping
    vec3 mapped = vec3(1.0) - exp(-hdr * iExposure);

    // gamma correction
    #ifdef USE_ACES
    mapped = RRTAndODT_Fit(mapped);
    #else
    mapped = pow(mapped, vec3(1.0 / iGamma));
    #endif


    fragColor = vec4(mapped, 1.0);
}
