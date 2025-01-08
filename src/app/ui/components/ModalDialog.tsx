import { AnimatePresence,motion } from "framer-motion";
import { Fragment } from "react";

export default function ModalDialog({ open,modalTitle }: { open: boolean,modalTitle: string }) {
    return (<AnimatePresence>
        {open && <motion.div className="bg-BackgroundColor absolute top-0">
            <p>{modalTitle}</p>
            <p></p>
        </motion.div>}
    </AnimatePresence>)
}