import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getDatabase, ref, set, remove, onValue, onDisconnect, serverTimestamp } from 'firebase/database'

// Public web config — safe to ship, access is enforced by database rules
const firebaseConfig = {
    apiKey: 'AIzaSyAtDm4JIg7fnF9rmDTGuPXiSjBuMRJ-AwQ',
    authDomain: 'waitingforai.firebaseapp.com',
    projectId: 'waitingforai',
    storageBucket: 'waitingforai.firebasestorage.app',
    messagingSenderId: '716282727254',
    appId: '1:716282727254:web:417a07aedbaa9d4b6ea4f7',
    // TODO: paste the URL shown after creating the Realtime Database in the console
    databaseURL: 'https://waitingforai-default-rtdb.firebaseio.com'
}

export async function createPresenceAdapter()
{
    const app = initializeApp(firebaseConfig)
    const auth = getAuth(app)
    const { user } = await signInAnonymously(auth)
    const database = getDatabase(app)

    const uid = user.uid
    const ownRef = ref(database, `presence/${uid}`)
    const presenceRef = ref(database, 'presence')

    // Server clock offset so the 5-minute TTL isn't fooled by local clock skew
    let serverTimeOffset = 0
    onValue(ref(database, '.info/serverTimeOffset'), (snapshot) =>
    {
        serverTimeOffset = snapshot.val() || 0
    })

    // The node only exists while inside the beach circle: removed on circle
    // exit (leave), tab hide, and — server-side — on socket disconnect
    let disconnectArmed = false
    let lastFields = null
    let suspended = false

    const adapter = {
        uid,

        publish(fields)
        {
            lastFields = fields

            if(!disconnectArmed)
            {
                disconnectArmed = true
                onDisconnect(ownRef).remove()
            }

            set(ownRef, { ...fields, t: serverTimestamp() }).catch(() => {})
        },

        leave()
        {
            lastFields = null
            disconnectArmed = false
            remove(ownRef).catch(() => {})
        },

        onPeers(callback)
        {
            onValue(presenceRef, (snapshot) =>
            {
                callback(snapshot.val() || {}, Date.now() + serverTimeOffset)
            })
        },

        destroy()
        {
            remove(ownRef).catch(() => {})
        }
    }

    // Hidden tabs don't run the game loop, so their ghosts would linger
    // frozen until the TTL: remove the node on hide, restore it on return
    const suspend = () =>
    {
        if(!lastFields)
            return

        suspended = true
        disconnectArmed = false
        remove(ownRef).catch(() => {})
    }

    document.addEventListener('visibilitychange', () =>
    {
        if(document.visibilityState === 'hidden')
        {
            suspend()
        }
        else if(suspended && lastFields)
        {
            suspended = false
            adapter.publish(lastFields)
        }
    })

    window.addEventListener('pagehide', suspend)

    return adapter
}
