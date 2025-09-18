#version 300 es
precision highp float;

out vec4 fragColor;

uniform sampler2D uScene;
uniform vec2 iResolution;
uniform float uGamma;
uniform float uExposure;

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;

    vec3 hdr = texture(uScene, uv).rgb;

    // exposure tone mapping
    vec3 mapped = vec3(1.0) - exp(-hdr * uExposure);

    // gamma correction
    mapped = pow(mapped, vec3(1.0 / uGamma));

    fragColor = vec4(mapped, 1.0);
}
