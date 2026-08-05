# How we keep the app safe (explained for a child)

A friendly, non-technical walkthrough of the protections around Spendifico's access flow. The
colourful version is [`app-safety-castle.html`](app-safety-castle.html) - open it in a browser.
The precise engineering detail lives in `backend/CLAUDE.md` (Access and sessions); this file is
the story version.

## Throttling is only one guard

Our app is like a castle with more than one wall. If a bad guy gets past one wall, there is still
another one waiting.

```
                    HOW WE KEEP THE MONEY DIARY SAFE
                    ================================

   the visitor
    |
    |   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   the MOAT
    v   ~~~~ locked glass tube (HTTPS) ~~~~~~   nobody can peek at
   +========================================+   what you send
   |  GUARD 1: the counting bouncer         |
   |     (throttling)                       |   "you have knocked
   |     counts each person's knocks        |    enough, come back
   +========================================+    in a bit"
   |  GUARD 2: the one-time magic ticket    |
   |     (emailed login link)               |   works ONCE, then
   |     no passwords exist to steal        |   turns to dust
   +========================================+
   |  GUARD 3: the silent doorman           |
   |     says the SAME thing to everyone    |   can't tell if you
   |     (no "that account exists")         |   are a member or not
   +========================================+
   |  GUARD 4: everyone gets their own room |
   |     (a separate database per person)   |   your stuff simply
   |     you cannot see into another room   |   is not IN my room
   +========================================+
                     |
                     v
                 your money diary, safe inside
```

## Guard 1, the bouncer: how the counting works

Imagine each person who walks up gets **a little bucket of coins**.

- Every time you knock (try to log in), you drop **one coin** in.
- The door only opens if you still have coins.
- Run out? The door says **"too many, come back later"** (a `429`).
- After a short wait (15 minutes) the bucket **refills**.

We count so a robot cannot stand at the door knocking a million times to guess its way in, or
spam a person's inbox with a thousand login links.

### There are actually TWO buckets, not one

This is the clever part, and it is on purpose. The bouncer keeps two separate counts, and he
turns you away if **either** one is empty:

- A **letter bucket**, counted per **email address** typed in the form (3 knocks per 15 minutes on
  the live app). This stops someone flooding **one person's inbox**, no matter where they knock
  from.
- A **doorstep bucket**, counted per **visitor's address on the street** (their network, 15 knocks
  per 15 minutes on the live app). This stops **one machine** trying **lots of different email
  addresses**.

Those two numbers are dialled down on purpose for everyday safety, and can be turned **up** for a
special event where lots of friends sign up at once on the same WiFi (see the grown-up note in
`docs/guides/deployment.md`).

Why two? Because one combined "this-person-at-this-door" count would be fooled by both real
tricks. A gang of robots all pestering one inbox looks like a new visitor every time (the letter
bucket still catches them, because the inbox is the same). One robot trying a giant list of inboxes
types something new every time (the doorstep bucket still catches it, because the street address is
the same). Two buckets, both tricks covered.

### The bug we fixed on 2026-08-05

The bouncer stands **behind a big front gate** (the Fly.io servers), and everyone walks through
that gate first. Our bouncer was accidentally watching the **gate** instead of the **people**, so
he thought the whole crowd was **one giant person** sharing **one doorstep bucket**. That meant a
single busy visitor could empty everyone's coins and lock the whole world out.

We taught him to look **past the gate at the real person**, so now **every person gets their own
bucket**. The letter bucket was always fine - it counts the typed email, which the gate never
changed.

## The other guards, quickly

- **Guard 2, the one-time ticket.** There is no password anywhere to steal. You get a link emailed
  to you; it works exactly **once**, expires in **15 minutes**, and we only ever keep its
  fingerprint, never the ticket itself.
- **Guard 3, the silent doorman.** Whether or not you already have an account, the app answers the
  **same** thing. A stranger cannot poke at the door to learn who is a member.
- **Guard 4, your own room.** Every person's data lives in **their own separate database**. You
  cannot peek into someone else's, because their things simply are not in your room. There is no
  shared drawer to rummage through.

## The one thing that is NOT a broken guard

Login emails sometimes land in the **spam** folder. That is not a hole in the castle. It is that
our castle is **brand new**, so the postman (Gmail) does not recognise our address yet and is being
cautious. It gets better on its own as we send more real mail over time.
