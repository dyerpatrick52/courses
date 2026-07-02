import { useState } from 'react';
import { submitFeedback } from '../api/client';

interface Props {
  onClose: () => void;
}

export default function FeedbackModal({ onClose }: Props) {
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await submitFeedback(message.trim());
      window.umami?.track('feedback-submitted');
      setSubmitted(true);
    } catch {
      setError('Failed to send — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6 text-sm text-gray-700 dark:text-gray-300"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>

        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Send Feedback</h2>

        {submitted ? (
          <div className="space-y-4">
            <p className="text-gray-500 dark:text-gray-400">Thanks for the feedback!</p>
            <button
              onClick={onClose}
              className="w-full py-2 rounded-lg text-white text-sm font-semibold transition-colors"
              style={{ background: 'var(--accent)' }}
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              className="w-full h-32 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Bug reports, suggestions, anything..."
              maxLength={2000}
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={loading || !message.trim()}
              className="w-full py-2 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? 'Sending…' : 'Send'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
