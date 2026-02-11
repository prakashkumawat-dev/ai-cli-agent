import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import { memo } from 'react'

const Logo = memo(() => {
    return (
        <Gradient colors={["#ff6404ff", "#ff6404ff"]}>
            <BigText align="left" text="HELLO" font="huge" />
        </Gradient>
    )
});

export default Logo;