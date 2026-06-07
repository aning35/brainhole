import { createPortal } from 'react-dom';
import { t } from 'i18next';
import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
	isOpen: boolean;
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	type?: 'danger' | 'warning' | 'info';
	onConfirm: () => void;
	onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
	isOpen,
	title,
	message,
	confirmText = t('ui.confirm'),
	cancelText = t('ui.cancel'),
	type = 'danger',
	onConfirm,
	onCancel,
}) => {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isOpen) return;
			if (e.key === 'Escape') onCancel();
			if (e.key === 'Enter') onConfirm();
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, onCancel, onConfirm]);

	if (!isOpen) return null;

	const buttonClass = type === 'danger'
		? "bg-red-500 hover:bg-red-600 text-white focus:ring-red-500"
		: "bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-500";

	const iconClass = type === 'danger'
		? "text-red-500 bg-red-100"
		: type === 'warning'
			? "text-orange-500 bg-orange-100"
			: "text-blue-500 bg-blue-100";

	return createPortal(
		<div
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
			onClick={onCancel}
		>
			<div
				className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-[90vw]"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-start gap-4 mb-4">
					<div className={`p-2 rounded-full flex-shrink-0 ${iconClass}`}>
						<AlertTriangle className="w-6 h-6" />
					</div>
					<div className="flex-1 mt-1">
						<h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
						<p className="text-sm text-gray-600 leading-relaxed">{message}</p>
					</div>
					<button
						onClick={onCancel}
						className="p-1 hover:bg-gray-100 rounded transition-colors ml-auto -mt-1"
					>
						<X className="w-5 h-5 text-gray-400" />
					</button>
				</div>

				<div className="flex justify-end gap-3 mt-6">
					<button
						type="button"
						onClick={onCancel}
						className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
					>
						{cancelText}
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors flex items-center gap-2 ${buttonClass}`}
						autoFocus
					>
						{confirmText}
					</button>
				</div>
			</div>
		</div>,
		document.body
	);
};
