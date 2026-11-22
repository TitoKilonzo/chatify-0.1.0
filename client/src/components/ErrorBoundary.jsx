import { Component } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from './ui/Button.jsx';
import styles from './ErrorBoundary.module.css';

/**
 * Catches render errors in its subtree and shows a recoverable fallback.
 *
 * Props:
 *   title, message  fallback copy
 *   onReset         called after the user presses "Try again" (the app shell reloads the page)
 *   onError         optional reporting hook, called with (error, info)
 *   resetKey        when this value changes the boundary clears its error, so the chat pane
 *                   recovers automatically when the user opens a different conversation
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(previousProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    const {
      title = 'Something went wrong',
      message = 'An unexpected error occurred. You can try again, or reload the page if the problem continues.',
    } = this.props;

    return (
      <div role="alert" className={styles.fallback}>
        <TriangleAlert size={32} aria-hidden="true" />
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <Button onClick={this.handleReset}>Try again</Button>
      </div>
    );
  }
}
