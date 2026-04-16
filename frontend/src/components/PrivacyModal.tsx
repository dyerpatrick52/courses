interface Props {
  onClose: () => void;
}

export default function PrivacyModal({ onClose }: Props) {
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

        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Privacy Policy</h2>

        <div className="space-y-3">
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200 mb-1">No personal data collected</p>
            <p className="text-gray-500 dark:text-gray-400">UOScheduler does not collect, store, or share any personal information. No accounts, no cookies, no tracking of individuals.</p>
          </div>

          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200 mb-1">Anonymous analytics</p>
            <p className="text-gray-500 dark:text-gray-400">This site uses <a href="https://umami.is" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-gray-200">Umami</a>, a privacy-friendly analytics tool. It records only aggregate page view counts — no cookies, no fingerprinting, no cross-site tracking, and fully GDPR-compliant.</p>
          </div>

          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200 mb-1">Not affiliated with uOttawa</p>
            <p className="text-gray-500 dark:text-gray-400">UOScheduler is an independent student project and is not affiliated with, endorsed by, or officially connected to the University of Ottawa. Course data is sourced from the public uOttawa class search.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
