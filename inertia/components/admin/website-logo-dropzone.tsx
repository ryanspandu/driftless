
import { ImageSettingControl } from "~/components/admin/image-setting-control";

const DEFAULT_LOGO = "/logo.svg";

type Props = {
  value: string;
  onChange: (logoUrl: string) => void;
  disabled?: boolean;
};

/** Admin sidebar logo: upload + compact preview. */
export function WebsiteLogoDropzone({ value, onChange, disabled }: Props) {
  return (
    <ImageSettingControl
      label="Logo"
      value={value}
      onChange={onChange}
      defaultAsset={DEFAULT_LOGO}
      resetLabel="Use default logo"
      disabled={disabled}
      preview="square"
    />
  );
}
