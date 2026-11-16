import React, { type FC } from "react";
import type { IconType } from "react-icons";
import * as FaIcons from "react-icons/fa6";
// import * as AiIcons from "react-icons/ai";
// import * as BsIcons from "react-icons/bs";
// import * as FiIcons from "react-icons/bi";
// import * as Io5Icons from "react-icons/ci";
// import * as RiIcons from "react-icons/cj";
// import * as TbIcons from "react-icons/di";
// import * as TfiIcons from "react-icons/fi";
// import * as TfiIcons from "react-icons/fc";
// import * as TfiIcons from "react-icons/fa";
// import * as TfiIcons from "react-icons/gi";
// import * as TfiIcons from "react-icons/go";
// import * as TfiIcons from "react-icons/gr";
// import * as TfiIcons from "react-icons/hi";
// import * as TfiIcons from "react-icons/hi2";
// import * as TfiIcons from "react-icons/im";
// import * as TfiIcons from "react-icons/lia";
// import * as TfiIcons from "react-icons/io";
// import * as TfiIcons from "react-icons/io5";
// import * as TfiIcons from "react-icons/lu";
// import * as TfiIcons from "react-icons/md";
// import * as TfiIcons from "react-icons/pi";
// import * as TfiIcons from "react-icons/rx";
// import * as TfiIcons from "react-icons/ri";
// import * as TfiIcons from "react-icons/si";
// import * as TfiIcons from "react-icons/sl";
// import * as TfiIcons from "react-icons/tb";
// import * as TfiIcons from "react-icons/tfi";
// import * as TfiIcons from "react-icons/ti";
// import * as TfiIcons from "react-icons/vsc";
// import * as TfiIcons from "react-icons/wi";

type IconMap = Record<string, IconType>;

interface IDynamicIcon extends React.SVGProps<SVGSVGElement> {
  icon: string;
  className?: string;
}

const iconLibraries: { [key: string]: IconMap } = {
  fa: FaIcons,
};

const DynamicIcon: FC<IDynamicIcon> = ({ icon, ...props }) => {
  const IconLibrary = getIconLibrary(icon);
  const Icon = IconLibrary ? IconLibrary[icon] : undefined;

  if (!Icon) {
    return <span className="text-sm">Icon not found</span>;
  }

  return <Icon {...props} />;
};

const getIconLibrary = (icon: string): IconMap | undefined => {
  const libraryKey = icon.substring(0, 2).toLowerCase();

  return iconLibraries[libraryKey];
};

export default DynamicIcon;
