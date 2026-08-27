import { COMPANY_INFO } from '../constants';

export default function BrandLogo({ className = '' }: { className?: string }) {
  return <span className={`brand-logo ${className}`.trim()}>
    <img src={COMPANY_INFO.logoUrl} alt="Estrella Real Estate" />
  </span>;
}
