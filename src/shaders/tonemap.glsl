#version 300 es
precision highp float;

out vec4 fragColor;

uniform sampler2D iScene;
uniform vec2 iResolution;
uniform float iGamma;
uniform float iExposure;

void main() {    
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    vec3 hdrColor = texture(iScene, uv).rgb;
    
    // Apply exposure
    vec3 mappedColor = hdrColor * iExposure;
    
    // Apply gamma correction
    mappedColor = pow(mappedColor, vec3(1.0 / iGamma));
    fragColor = vec4(mappedColor, 1.0);
}
