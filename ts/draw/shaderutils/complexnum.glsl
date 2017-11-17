#pragma global PRECISION

#pragma global multiply
PRECISION vec2 multiply(PRECISION vec2 a, PRECISION vec2 b)
{
    PRECISION vec3 t = vec3(b, -b.y);
    return vec2(dot(a.xy, t.xz), dot(a.xy, t.yx));
}
