import { COMPANY_INFO } from '../constants';

type BrandLogoProps = {
  className?: string;
  transparent?: boolean;
};

export default function BrandLogo({ className = '', transparent = false }: BrandLogoProps) {
  const source = transparent ? '/estrella-logo-transparent.png' : COMPANY_INFO.logoUrl;

  return <span className={`brand-logo ${transparent ? 'brand-logo-transparent' : ''} ${className}`.trim()}>
    <img src={source} alt="Estrella Real Estate" />
  </span>;
}
