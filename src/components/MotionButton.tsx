import { Button } from "@/components/ui/button";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";

type ButtonProps = ComponentPropsWithoutRef<typeof Button>;

export const MotionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function MotionButton(props, ref) {
    return <Button ref={ref} {...props} />;
  },
);
