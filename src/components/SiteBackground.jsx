import GridScan from '../GridScan';
import { useTheme } from '../Theme';
import './site-background.css';

export default function SiteBackground() {
  const { theme } = useTheme();
  const light = theme === 'light';
  return <div className="homepage-background" aria-hidden="true">
    <GridScan sensitivity={0.43} lineThickness={1} linesColor="#000000" gridScale={0.1}
      scanColor="#ffffff" scanOpacity={light ? .29 : .24} scanDuration={3.7} scanDelay={.9}
      scanTimeOffset={1} enablePost bloomIntensity={light ? .36 : .31}
      chromaticAberration={.0009} noiseIntensity={.005} scanGlow={light ? .30 : .26}
      maxPixelRatio={1.5} pixelBudget={1800000} maxFps={30} />
  </div>;
}
