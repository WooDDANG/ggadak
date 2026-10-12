import ts from 'typescript';
import type { Plugin } from 'vite';

/** TSOA and TypeDI rely on legacy decorators and emitted parameter metadata. */
export function backendTypescript(): Plugin {
  return {
    name: 'backend-typescript-metadata',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('.ts') || id.includes('/node_modules/') || !id.includes('/apps/be/src/'))
        return;
      const output = ts.transpileModule(source, {
        fileName: id,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          sourceMap: true,
          inlineSources: true,
        },
      });
      return { code: output.outputText, map: output.sourceMapText };
    },
  };
}
