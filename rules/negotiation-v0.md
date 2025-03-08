Overview
Negotiation is a strategic two-player game where each participant starts with a set of resources valued differently by each player. The objective is to negotiate trades that enhance the total value of your resources more than your opponent can. Players alternate turns to communicate and make trade offers, aiming to optimize their inventory's value while managing the opponent's resources.

Action Space
Format: Actions are strings representing the player's messages or trade actions.
Special Tokens:
[Offer]: To make a trade offer.
Format: [Offer: <your resources> -> <their resources>.
Example: [Offer: 2 Wheat, 1 Ore -> 3 Sheep]
[Accept]: To accept an incoming trade offer.
[Deny]: To deny an incoming trade offer.
Examples:
"I think we should collaborate on gathering more resources."
"[Offer: 1 Wood -> 2 Wheat]"
"That is not worth it for me. [Deny]. But how about this: [Offer: 2 Wood -> 5 Wheat]"
"Fantastic. [Accept]"
Notes:
Players can include additional text before or after the special tokens.
When responding to an offer, ensure your reply contains either [Accept] or [Deny] as appropriate.

Gameplay
Players: 2
Turns: Players alternate sending messages or making trade offers.
Resources: Each player starts with a random allocation of resources: Wheat, Wood, Sheep, Brick, Ore.
Resource Values: Each resource has a value that varies per player (±20% of the base value), influencing the strategic value of trades.
Objective: Maximize the total value of your resources by negotiating beneficial trades while minimizing the opponent's advantage.
Turn Limit: The game can be configured with a maximum number of turns (default is 10), after which it ends and the player with the highest inventory value gain wins.
Key Rules
Resources and Values:

Each player starts with a random quantity of resources.
The value of each resource is personalized for each player, affecting the trade dynamics.
Making Trade Offers:

Players can propose trades using the [Offer] token.
The offer must specify what the proposer is giving and what they are requesting in return.
Format: [Offer: <your resources> -> <their resources>]
Example: [Offer: 2 Wheat, 1 Ore -> 3 Sheep]
Responding to Offers:

When a player receives a trade offer, they must respond using [Accept] or [Deny].
[Accept]: Agree to the trade, resulting in the exchange of specified resources.
[Deny]: Reject the trade, and the current offer is discarded.
Valid Moves:

All actions must strings. If the opponent has made an offer ([Offer]), the immediate next action needs to contain either [Accept] or [Deny]; as appropriate.
Offers must follow the correct format and involve available resources.
Winning Conditions:

Win: At the end of the game, the player with the highest increase in inventory value compared to their initial value wins.
Draw: If both players have the same increase in inventory value after the maximum number of turns.
Loss: If a player makes an invalid trade offer or accepts a trade without sufficient resources, they receive a penalty.
Game Termination:

The game ends when the maximum number of turns is reached.
The winner is determined based on the change in inventory values.
In cases of invalid moves, the game will terminate early with penalties applied.