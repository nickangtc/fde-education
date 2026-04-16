# To Claw or not to Claw?

_Slow Riches · Nick Ang · April 13, 2026_  
_Inside: 1 big tip on how + 1 clear reason to at least try_

Source: <https://nickang.substack.com/p/to-claw-or-not-to-claw>

I have to admit something: I may have worked 10 years as a software engineer, but I couldn't get OpenClaw to work meaningfully even after 4 attempts.

First, if you're wondering what OpenClaw is: it's the fastest growing, most popular codebase on GitHub in existence. It aims to let anyone have a personal AI agent. For what? Well, that's the fun part. You can get it to do whatever you want.

But the "fun" part is also the reason why it's so darn hard to get started with OpenClaw despite all its promise. It's wide open for interpretation and setup. Even for experienced developers like me.

In this post, I'll share the one big tip on making it work and one simple reason why I decided to sink more time into trying to get my own Claw going.

## One big tip for making it work

Use [AlphaClaw](https://github.com/chrysb/alphaclaw). That's the tip.

OpenClaw is deeply developer-focused. In its current incarnation, it's practically unusable for anyone unfamiliar with Shell, Terminal, SSH, configs, environment variables, and so on. That's where AlphaClaw comes in.

AlphaClaw is a wrapper around OpenClaw that makes it much smoother to get an instance of OpenClaw up and running and maintain it over time.

It comes with a lot of sensible defaults, asks for API keys upfront in a web app interface, and clearly signals which keys matter most.

Using it is like this: click next, type in a key, click next, select Telegram, read the pairing instructions, paste the key, click next, done.

For me, AlphaClaw's web UI was the biggest unlock so far in getting OpenClaw to work without pulling hair. It gives you a dashboard that tells you everything you need to know, and it requires a lot less technical knowledge to understand what's going on than the built-in OpenClaw dashboard.

## One simple reason I'm sinking more time into it

[Image placeholder: On Telegram, me asking my Claw to try something and it worked without a hitch.]

For context, I write a lot everywhere and one of my biggest sources of low-key stress is: where do I post?

I used to write exclusively on my blog until I realised the reach is very small. An unread writer is not really a writer, at least not to me. A writer writes for people to read. So reach matters.

That's why I started this newsletter and started posting more regularly.

But this shift pains me and I've ding-donged a few times from Substack to blog and back again. The core tension is:

- Posting on Substack gives reach, but if Substack shuts down, I lose all my content.
- Posting on my blog gives full content ownership, but SEO is dead and there's very little reach.

I want to own my content and have reach. To do that is very hard, until now.

[Image placeholder: My Substack posts now get ported over to my blog automatically with an AI agent.]

So that experiment I asked my Claw to do worked without a hitch based on this prompt:

```text
ok, let's try something - go to nickang.substack.com and parse the latest article. then pull nickang-blog-gatsby repo from github. port it over to my blog since it doesn't exist there. markdown formatted well, with image downloaded from the substack post etc.
```

This single message I sent to a bot on Telegram managed to get a post from my Substack newsletter into my personal blog. Previously this would have been a half-day task if it were to be robust, and I just never found the time to do it.

Once that worked, I told it to "make it a skill" and "run this every Sunday at 10pm, checking latest 10 posts, porting over whichever doesn't yet exist on my blog", and now it's automated.

What. A. Time. To. Be. Alive.

Another thing I tried:

```text
hey, try something for me now - u should have google docs read/write credentials. find out where they are stored, then create a short google doc and send me a link to it. it should live in my account after that since the creds are from GCP authorised to my account
```

That eventually led to my Claw creating a Google Doc in my drive, sending me a URL that worked, with a document for me to read and annotate with inline comments. My Claw can even read my inline comments and reply inline.

[Image placeholder: The moment I realised I'd unlocked a new world of AI collaboration.]

These are just two immediate use cases I thought of. People who are experimenting with making the most out of their OpenClaws are already far ahead of this. Garry Tan has been sharing useful things like [gbrain](https://github.com/garrytan/gbrain) and [gstack](https://github.com/garrytan/gstack), and doing it while [sending voice messages to his setup from off-time](https://x.com/garrytan/status/2043100662549090516).

## Tiny bit more context on how I'm using AlphaClaw

Here's my timeline using it:

- Tried it yesterday with the one-click install on Railway.
- Played with it for hours during pockets of downtime while looking after a sick kid at home.
- At the end of the day, I realised 8 GB vCPU, 8 GB RAM, and 4 GB disk space was too little, so I shut it down and re-set it up on my Linux laptop, which is now always on.

The easiest way to get started is to use Railway or Render. Click, done. Then if you have a spare laptop at home, you can install AlphaClaw there eventually for free apart from electricity.

See the [AlphaClaw repo](https://github.com/chrysb/alphaclaw). Hat tip: Garry Tan's [gbrain](https://github.com/garrytan/gbrain) was what alerted me to its existence.

## Claw forward

So here's my advice if you're still on the fence or sleeping on the wave of change that's coming with AI: think of one potential use case and start trying things like OpenClaw.

With AlphaClaw, you'll be spared a lot of frustration.

With a single positive outcome, you'll see the light and finally find motivation to get to the other side of the tunnel.

At least that's what seems to be happening with me. After many false starts, I'm starting to get some value out of my Claw. I hope you'll find some too.

---

Closing remark: I'm much happier writing this Substack post now because I know it'll land on my blog next Sunday without me doing anything.
