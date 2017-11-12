export type Constructor<T> = Function & { prototype: T };

/**
 * Checks the type of the given object at runtime and returns a typed value.
 */
export function downcast<T>(ctor: Constructor<T>, obj: any): T
{
    if (typeof obj !== 'object') {
        throw new TypeError(`expected object, got ${typeof obj}`);
    }
    if (!(obj instanceof ctor)) {
        throw new TypeError("invalid class type");
    }
    return <T> obj;
}

/**
 * Checks the type of the given object at runtime and returns a typed value.
 * Returns `null` for a null-ish value (`undefined` or `null`).
 */
export function downcastOrNull<T>(ctor: Constructor<T>, obj: any): T | null
{
    if (obj == null) {
        return obj;
    }
    return downcast(ctor, obj);
}
