const getLatestVersion = (versions) => {
    // Filter out non-version entries
    const versionNumbers = versions.filter(v => v.match(/^\d+(\.\d+)*$/));

    if (versionNumbers.length === 0) {
        // Return 'default' if no version numbers are found
        return 'default';
    }

    // Sort versions
    versionNumbers.sort((a, b) => {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aPart = aParts[i] || 0;
            const bPart = bParts[i] || 0;
            if (aPart > bPart) return -1;
            if (aPart < bPart) return 1;
        }
        return 0;
    });

    // Return the latest version
    return versionNumbers[0];
};

module.exports = {
    getLatestVersion
}