import { Component, type ReactNode } from 'react'
import { UnexpectedError } from '../../pages/UnexpectedError'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('App render failed', error)
  }

  private reset = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return <UnexpectedError onReset={this.reset} />
    }

    return this.props.children
  }
}
