import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import React from "react";

const MotionButtonInner = motion.create(Button);

type MotionButtonProps = React.ComponentProps<typeof MotionButtonInner>;

export const MotionButton = React.forwardRef<
  HTMLButtonElement,
  MotionButtonProps
>(function MotionButton(props, ref) {
  return (
    <MotionButtonInner
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      {...props}
    />
  );
});
