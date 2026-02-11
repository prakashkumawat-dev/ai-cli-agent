import { Box, Text, Newline } from 'ink';
import { memo } from 'react';

const Info = memo(() => {
    return (
        <Box flexDirection='column' marginBottom={1} paddingLeft={1}>
            <Text color={'#b0b0b0ff'} wrap='wrap'>Tips to getting started.</Text>
            <Newline />
            <Text color={'#b0b0b0ff'} wrap='wrap'>1. crete or build your apps with custom</Text>
            <Text color={'#b0b0b0ff'} wrap='wrap'>2. edit files , run commands with custom.</Text>
            <Text color={'#b0b0b0ff'} wrap='wrap'>3. debug with custom</Text>
            <Text color={'#b0b0b0ff'} wrap='wrap'>4. type 'q' for exit</Text>
        </Box>
    )
});

export default Info;