

type HookType = {
    Layout: {
        bg: string,
        fg: string
    },
    MenuTheme: {
        bg: string,
        fg: string,
        activeFg: string,
        itemSelectedBg: string
    },
    borderActiveColor: string
    borderColor: string
}

export const useNextJSToAntdTheme = (theme: string | undefined): HookType => {
    switch (theme) {
        case "purple":
            return {
                Layout: {
                    bg: "#682a92",
                    fg: "#fbfaff"
                },
                MenuTheme: {
                    bg: "#682a92",
                    fg: "#fbfaff",
                    activeFg: "#000000",
                    itemSelectedBg: "#590996"
                },
                borderColor: "#613dc1",
                borderActiveColor: "#ffffff"
            }
        case "dark":
            return {
                Layout: {
                    bg: "#04052e",
                    fg: "#fbfaff"
                },
                MenuTheme: {
                    bg: "#04052e",
                    fg: "#fbfaff",
                    activeFg: "#000000",
                    itemSelectedBg: "#090a57"
                },
                borderColor: "#613dc1",
                borderActiveColor: "#522882"
            }
        case "light":
            return {
                Layout: {
                    bg: "",
                    fg: ""
                },
                MenuTheme: {
                    bg: "",
                    fg: "",
                    activeFg: "",
                    itemSelectedBg: ""
                },

                borderColor: "613dc1",
                borderActiveColor: "#522882"
            }
        default:
            return {
                Layout: {
                    bg: "",
                    fg: ""
                },
                MenuTheme: {
                    bg: "",
                    fg: "",
                    activeFg: "",
                    itemSelectedBg: ""
                },
                borderColor: "613dc1",
                borderActiveColor: "#522882"
            }

    }
}