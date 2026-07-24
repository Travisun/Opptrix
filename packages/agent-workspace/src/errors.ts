export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

export class PathEscapeError extends WorkspaceError {
  constructor(message = '路径超出授权范围') {
    super(message)
    this.name = 'PathEscapeError'
  }
}

export class DenyPathError extends WorkspaceError {
  constructor(message = '该路径受保护，无法访问') {
    super(message)
    this.name = 'DenyPathError'
  }
}

export class QuotaExceededError extends WorkspaceError {
  constructor(message = '工作区存储已达上限') {
    super(message)
    this.name = 'QuotaExceededError'
  }
}

export class SsrfBlockedError extends WorkspaceError {
  constructor(message = '不允许访问该网络地址') {
    super(message)
    this.name = 'SsrfBlockedError'
  }
}

export class ConfirmationRequiredError extends WorkspaceError {
  readonly confirmation: {
    kind: 'overwrite' | 'delete'
    root_id: string
    path: string
    title: string
    prompt: string
    options: Array<{ id: string; label: string }>
  }

  constructor(confirmation: ConfirmationRequiredError['confirmation']) {
    super('需要用户确认')
    this.name = 'ConfirmationRequiredError'
    this.confirmation = confirmation
  }
}
