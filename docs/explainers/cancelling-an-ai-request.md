# What a Stop button really has to do (explained without jargon)

A non-technical walkthrough of why cancelling an AI request is more work than adding a button, and
what "three hops" means. The precise engineering detail lives in
`docs/plans/2026-08-10_PET-73_assistant-chat.md` (the cancellation section); this file is the plain
version, in the same spirit as `app-safety-for-kids.md` beside it.

No code in this file.

## The situation

When someone asks the assistant a question, the app has to send that person's entire spending
history off to Google's AI and wait for an answer to come back. That wait is long: somewhere between
twenty seconds and a minute. Long enough that a person will sometimes change their mind, or realise
they asked the wrong thing, and want to give up.

So they need a **Stop** button. `AbortController` is simply the name of the tool a web browser gives
us for making a Stop button actually stop something. That is the whole of what it is: a cancel handle
for a request that is still in flight.

## Why it isn't just a button

Here is the part that is genuinely surprising, and the reason it was worth raising.

There were two ways to send the question. One is a modern shortcut the framework offers, which is
convenient and slightly less code. The other is the plainer, older way. They look equivalent, and for
almost everything in this app they are.

The difference is that **the convenient way gives you no cancel handle at all.** Once the question is
sent, there is no way to say "never mind". The only thing you could do is lie: let the work finish,
then quietly throw the answer away when it arrives and never show it. The person sees the screen go
back to normal, so it feels cancelled, but nothing was cancelled. The full minute still passes
somewhere, and the full cost is still paid.

This app already does exactly that lie in one place: the receipt scanner's "Cancel scan". It was the
right call there, because a receipt scan is quick and cheap. It is the wrong call for the assistant,
because every single question re-sends the person's whole spending history, and on the free tier that
has a real cost. Abandoning a question and still paying for it is precisely what we want to avoid.

So we switch to the plainer way, which costs one extra small file and gets a Stop button that
genuinely stops.

## Why "three hops"

The question does not travel in one leap. It is passed along a chain, a bit like a phone call being
transferred.

```
                 WHAT HAPPENS WHEN YOU ASK A QUESTION
                 ====================================

   the person
    |  types a question, presses Send
    v
   +==========================+
   |  1. their BROWSER        |  holds the Stop button
   +==========================+
    |  "here is the question"
    v
   +==========================+
   |  2. our APP's server     |  relays it, adds the login proof
   +==========================+
    |
    v
   +==========================+
   |  3. our BACKEND          |  gathers the spending history
   +==========================+
    |
    v
   +==========================+
   |  4. GOOGLE's AI          |  does the actual thinking (slow, costs money)
   +==========================+


                 WHAT HAPPENS WHEN YOU PRESS STOP
                 ================================

   the person presses Stop
    |
    v
   BROWSER  ---- hangs up ---->  hop 1  DONE, easy
    |
    v
   APP      ---- hangs up ---->  hop 2  DONE, small
    |
    v
   BACKEND  ---- hangs up ---->  hop 3  FIDDLY, and invisible
    |
    v
   GOOGLE   stops thinking       <-- this is the one that saves money


   Skip hop 3 and the screen looks IDENTICAL.
   Google keeps working. You keep paying. Nobody reads the answer.
```

Now imagine the person hangs up at step 1. Everyone further down the chain is still holding the
phone. Our app's server is still waiting on our backend, our backend is still waiting on Google, and
Google is still working through the whole spending history for a question nobody is listening to.

Hanging up has to be **passed down the chain**, one link at a time. That is what "three hops" means.
Each link has to be told to hang up, and each one is a separate small piece of work.

The reason they are worth splitting out rather than treating as one job is that they buy different
things:

- **The first two hops** make the screen honest. The person presses Stop, the waiting stops, the box
  comes back with their text in it, and they can carry on. This is the part they can see.
- **The third hop** is the one that actually stops Google working, so the question stops costing
  money. This is the part they cannot see at all.

That last point is the important one: **a Stop button that only does the first two hops looks
identical on screen to one that does all three.** You cannot tell by clicking it. The only difference
shows up on the bill.

## The trap in the third hop

The way a server finds out "the caller hung up" is by listening for the connection closing. The
awkward part is that the connection also closes when everything goes *perfectly* and the answer has
just been delivered.

So if we are careless, the server sees a normal, successful, completed conversation, mistakes it for
someone hanging up, and throws away the answer it just spent a minute producing.

What makes that nasty is not the bug itself but how it hides. The code looks correct. Nothing fails a
test. In the logs it looks like the AI was just being flaky that time. That is why it is written into
the plan as something to check by hand in a real browser, including deliberately letting one question
finish normally to prove the good case still works. It is also the first place in this whole backend
that does this kind of listening, so there is no existing example to copy from.

## One thing that came free

The plan already says nothing gets saved to the database until the AI's answer actually arrives. That
was decided for a different reason, but it means a cancelled question is automatically not saved. No
extra work. Press Stop, reload the page, and the abandoned question is simply gone rather than
sitting there half-finished.

## The short version

`AbortController` is a Stop button that is real instead of pretend. Real matters here because each
question is expensive and slow, so a fake Stop would keep charging for answers nobody will ever read.
The cost of making it real is one extra file and one fiddly, invisible piece at the far end of the
chain.

All three hops are in scope for PET-73. The receipt scanner still has the pretend version, and
`docs/TODO.md` records that as work to do once this one has proved the pattern.
