#version 300 es
precision highp float;

uniform highp sampler2D iScene;
uniform vec2 iResolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution;
    vec3 color = texture(iScene, uv).rgb;
    // Convert linear light to display values with an approximate gamma of 2.2.
    fragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
