/** The linked wallet cannot be told apart from the others: the user has to pick it. */
export class ChooseWallet extends Error {
  override readonly name = "ChooseWallet";
}
