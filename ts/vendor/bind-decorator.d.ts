// ST3's TypeScriptCompletion plugin did not recognize the definition file that
// comes with `bind-decorator` so I had to add this file to the project's
// source tree
declare module 'bind-decorator'
{
    export function bind<T extends Function>(target: object, propertyKey: string, descriptor: TypedPropertyDescriptor<T>): TypedPropertyDescriptor<T> | void;
    export default bind;
}
