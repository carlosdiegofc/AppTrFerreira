package uy.transportesferreira.gps
/** How a driver uses the app. Simple mode has two screens: start a trip, and the trip in progress. */
object UiMode {
    const val SIMPLE="simple"
    const val NORMAL="normal"
    /** Accounts that can see the whole fleet. */
    private val owners=setOf("luis@trferreira.com","transportesferreirauy@gmail.com")
    /** Owners who also drive: they start like any driver and reach the fleet through the owner menu. */
    private val drivingOwners=setOf("luis@trferreira.com")
    private fun key(email:String?)=email?.trim()?.lowercase()?:""
    fun owner(email:String?)=key(email) in owners
    fun drivingOwner(email:String?)=owner(email)&&key(email) in drivingOwners
    /** Owner accounts that open on the fleet panel instead of the driver screens. */
    fun panelFirst(email:String?)=owner(email)&&!drivingOwner(email)
    fun parse(saved:String?):String?=when(saved){SIMPLE,NORMAL->saved;else->null}
    /** First screen after signing in or reopening the app. panel is true for accounts that open on the fleet panel. */
    fun start(panel:Boolean,mode:String?,tripActive:Boolean):String=when{
        panel->"owner"
        parse(mode)==null->"mode"
        mode==SIMPLE->if(tripActive)"simpletrip" else "simplehome"
        tripActive->"trip"
        else->"home"
    }
}
