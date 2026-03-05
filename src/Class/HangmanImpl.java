package Class;
import Interface.*;

public class HangmanImpl implements Hangman {
    @Override
    public void hangUp(Man man) {
        man.hangUp();
    }

    @Override
    public void applySanction(Man man) {
        man.addMistake();
    }
}