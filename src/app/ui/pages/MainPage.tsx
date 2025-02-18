"use client"

const AkiraTitle = ({children}:{children: React.ReactNode}) => {
    return (<p className="text-2xl font-bold">{children}</p>)
}
export default function MainPage() {

    return (<div className="min-h-dvh text-center">
        <AkiraTitle>
            News
        </AkiraTitle>
        <AkiraTitle>
            Socials
        </AkiraTitle>
        <AkiraTitle>
            Support me
        </AkiraTitle>
    </div>)
}
