// swagger-ui-react ships no type definitions and has no @types package that
// tracks v5. Only the props used by src/app/(dashboard)/api-docs are declared.
declare module 'swagger-ui-react' {
  import type { ComponentType } from 'react'

  export interface SwaggerUIProps {
    spec?: object
    url?: string
    docExpansion?: 'list' | 'full' | 'none'
    defaultModelsExpandDepth?: number
    persistAuthorization?: boolean
    tryItOutEnabled?: boolean
    supportedSubmitMethods?: string[]
    requestInterceptor?: (req: {
      url: string
      method: string
      headers: Record<string, string>
      body?: unknown
    }) => unknown
    responseInterceptor?: (res: unknown) => unknown
    onComplete?: (system: unknown) => void
  }

  const SwaggerUI: ComponentType<SwaggerUIProps>
  export default SwaggerUI
}

declare module 'swagger-ui-react/swagger-ui.css'
